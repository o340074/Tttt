import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PayloadCryptoService } from '../crypto/payload-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { StockImportReport } from '@advault/types';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Env } from '../config/env';

/** How often overdue reserves are swept back to available across the pool. */
const SWEEP_INTERVAL_MS = 60_000;
/** Bounded retries when a reserve claim races another checkout for the same rows. */
const RESERVE_ATTEMPTS = 4;

const redisHoldKey = (id: string): string => `stock:hold:${id}`;

/** Prisma delegate subset the sell path needs — the real client or a tx client. */
type StockTx = Pick<Prisma.TransactionClient, 'stockItem' | 'delivery' | 'orderItem'>;

/** Delegates needed to recompute the cache — real client or tx client. */
type StockCountTx = Pick<Prisma.TransactionClient, 'stockItem' | 'productVariant'>;

/**
 * READY_STOCK inventory (docs/05, docs/08). A checkout reserves concrete
 * StockItems first (available → reserved, +TTL), then the money transaction
 * converts them to sold and writes a Delivery. `ProductVariant.stockCount`
 * is a cache recomputed as COUNT(status='available') after every mutation.
 * Overdue reserves return to the pool via a sweep, so a crashed checkout
 * never strands stock.
 */
@Injectable()
export class StockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StockService.name);
  private readonly reserveTtlSeconds: number;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly crypto: PayloadCryptoService,
    config: ConfigService<Env, true>,
  ) {
    this.reserveTtlSeconds = config.get('STOCK_RESERVE_TTL_SECONDS', { infer: true });
  }

  // ---------- Reserve (phase 1, before the money transaction) ----------

  /**
   * Claim `quantity` available units of a variant → reserved (+ TTL), returning
   * their StockItem ids. Any partial claim is released before throwing
   * OUT_OF_STOCK, so a shortfall never strands units. Exactly-once safe: each
   * row is flipped under a `status='available'` guard, so no unit is claimed
   * by two checkouts.
   */
  async reserve(variantId: string, quantity: number, sku: string): Promise<string[]> {
    await this.releaseOverdue(variantId); // reclaim expired holds before picking
    const reservedUntil = new Date(Date.now() + this.reserveTtlSeconds * 1000);
    const held: string[] = [];
    try {
      for (let attempt = 0; attempt < RESERVE_ATTEMPTS && held.length < quantity; attempt += 1) {
        const candidates = await this.prisma.stockItem.findMany({
          where: { variantId, status: 'available' },
          orderBy: { createdAt: 'asc' },
          take: quantity - held.length,
          select: { id: true },
        });
        if (candidates.length === 0) break;
        for (const candidate of candidates) {
          const claimed = await this.prisma.stockItem.updateMany({
            where: { id: candidate.id, status: 'available' },
            data: { status: 'reserved', reservedUntil },
          });
          if (claimed.count === 1) held.push(candidate.id);
        }
      }
    } catch (error) {
      await this.release(held);
      throw error;
    }
    if (held.length < quantity) {
      await this.release(held);
      throw new ApiException('OUT_OF_STOCK', 'Not enough items in stock', 409, {
        sku,
        available: held.length,
      });
    }
    await this.markRedisHold(held);
    await this.recomputeStockCount(this.prisma, variantId);
    return held;
  }

  /** Return reserved units to the pool (checkout failure / cancellation). */
  async release(stockItemIds: string[]): Promise<void> {
    if (stockItemIds.length === 0) return;
    const items = await this.prisma.stockItem.findMany({
      where: { id: { in: stockItemIds }, status: 'reserved' },
      select: { variantId: true },
    });
    await this.prisma.stockItem.updateMany({
      where: { id: { in: stockItemIds }, status: 'reserved' },
      data: { status: 'available', reservedUntil: null },
    });
    await this.clearRedisHold(stockItemIds);
    for (const variantId of new Set(items.map((i) => i.variantId))) {
      await this.recomputeStockCount(this.prisma, variantId);
    }
  }

  // ---------- Sell (phase 2, inside the money transaction) ----------

  /**
   * Convert already-reserved units → sold, bind them to the order item and
   * write one auto Delivery per unit (snapshotting the encrypted payload).
   * Runs inside the checkout transaction; a lost reservation rolls it back.
   */
  async sellReserved(tx: StockTx, stockItemIds: string[], orderItemId: string): Promise<void> {
    for (const id of stockItemIds) {
      const claimed = await tx.stockItem.updateMany({
        where: { id, status: 'reserved' },
        data: { status: 'sold', orderItemId, reservedUntil: null },
      });
      if (claimed.count !== 1) {
        throw new ApiException('OUT_OF_STOCK', 'Stock reservation was lost', 409);
      }
      const unit = await tx.stockItem.findUnique({ where: { id } });
      await tx.delivery.create({
        data: {
          orderItemId,
          stockItemId: id,
          payload: unit!.payload, // encrypted snapshot of what was handed over
          type: 'auto',
          deliveredAt: new Date(),
        },
      });
    }
    await tx.orderItem.update({
      where: { id: orderItemId },
      data: { deliveryStatus: 'delivered' },
    });
  }

  /**
   * Issue a warranty replacement (E10): convert one already-reserved unit → sold,
   * bind it to the same order item and write a `replacement` Delivery, returning
   * its id. Unlike `sellReserved` it never touches the line's deliveryStatus —
   * the warranty service sets `replaced` after the claim transition. Runs inside
   * the caller's transaction; a lost reservation rolls it back.
   */
  async deliverReplacement(tx: StockTx, stockItemId: string, orderItemId: string): Promise<string> {
    const claimed = await tx.stockItem.updateMany({
      where: { id: stockItemId, status: 'reserved' },
      data: { status: 'sold', orderItemId, reservedUntil: null },
    });
    if (claimed.count !== 1) {
      throw new ApiException('OUT_OF_STOCK', 'Stock reservation was lost', 409);
    }
    const unit = await tx.stockItem.findUnique({ where: { id: stockItemId } });
    const delivery = await tx.delivery.create({
      data: {
        orderItemId,
        stockItemId,
        payload: unit!.payload, // encrypted snapshot of what was handed over
        type: 'replacement',
        deliveredAt: new Date(),
      },
    });
    return delivery.id;
  }

  // ---------- Import (admin) ----------

  /**
   * Encrypt and store stock lines for a variant. Blank lines and per-variant
   * duplicates (by plaintext SHA-256) are skipped, so re-importing the same
   * file is idempotent. Returns added/skipped and the fresh available count.
   */
  async importLines(variantId: string, lines: string[]): Promise<StockImportReport> {
    let added = 0;
    let skipped = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        skipped += 1;
        continue;
      }
      try {
        await this.prisma.stockItem.create({
          data: {
            variantId,
            payload: this.crypto.encrypt(line),
            payloadHash: this.crypto.hash(line),
          },
        });
        added += 1;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          skipped += 1; // same line already imported for this variant
          continue;
        }
        throw error;
      }
    }
    const stockCount = await this.recomputeStockCount(this.prisma, variantId);
    return { added, skipped, stockCount };
  }

  // ---------- Stock-count cache ----------

  /** Set the variant's cached stockCount to its live available-pool size. */
  async recomputeStockCount(tx: StockCountTx, variantId: string): Promise<number> {
    const available = await tx.stockItem.count({ where: { variantId, status: 'available' } });
    await tx.productVariant.update({ where: { id: variantId }, data: { stockCount: available } });
    return available;
  }

  // ---------- Overdue-reserve sweep ----------

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => {
      void this.releaseOverdue();
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /** Flip reserves past their TTL back to available; optionally scoped to a variant. */
  async releaseOverdue(variantId?: string): Promise<number> {
    try {
      const now = new Date();
      const where: Prisma.StockItemWhereInput = {
        status: 'reserved',
        reservedUntil: { lt: now },
        ...(variantId ? { variantId } : {}),
      };
      const overdue = await this.prisma.stockItem.findMany({
        where,
        select: { id: true, variantId: true },
      });
      if (overdue.length === 0) return 0;
      await this.prisma.stockItem.updateMany({
        where: { id: { in: overdue.map((o) => o.id) }, status: 'reserved' },
        data: { status: 'available', reservedUntil: null },
      });
      await this.clearRedisHold(overdue.map((o) => o.id));
      for (const affected of new Set(overdue.map((o) => o.variantId))) {
        await this.recomputeStockCount(this.prisma, affected);
      }
      if (!variantId) this.logger.log(`Released ${overdue.length} overdue stock reserve(s)`);
      return overdue.length;
    } catch (error) {
      this.logger.warn(`Overdue-reserve sweep failed: ${(error as Error).message}`);
      return 0;
    }
  }

  // ---------- Redis hold mirror (fast TTL; DB reservedUntil is authoritative) ----------

  private async markRedisHold(stockItemIds: string[]): Promise<void> {
    try {
      const pipeline = this.redis.client.multi();
      for (const id of stockItemIds) {
        pipeline.set(redisHoldKey(id), '1', 'EX', this.reserveTtlSeconds);
      }
      await pipeline.exec();
    } catch {
      // Best-effort mirror; the DB sweep reclaims regardless.
    }
  }

  private async clearRedisHold(stockItemIds: string[]): Promise<void> {
    if (stockItemIds.length === 0) return;
    try {
      await this.redis.client.del(...stockItemIds.map(redisHoldKey));
    } catch {
      // Best-effort mirror.
    }
  }
}
