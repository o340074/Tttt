import { beforeEach, describe, expect, it } from 'vitest';
import { PayloadCryptoService } from '../crypto/payload-crypto.service';
import {
  makeFakeConfigService,
  makeFakePrismaService,
  makeFakeRedisService,
  makeVariantRow,
} from '../testing/fakes';
import { StockService } from './stock.service';
import type { ProductVariant as DbVariant } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

describe('StockService', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let stock: StockService;
  let crypto: PayloadCryptoService;
  let variant: DbVariant;

  const availableCount = (): number =>
    prisma.stockItem.rows.filter((r) => r.variantId === variant.id && r.status === 'available')
      .length;

  beforeEach(() => {
    prisma = makeFakePrismaService();
    const config = makeFakeConfigService();
    crypto = new PayloadCryptoService(config);
    stock = new StockService(
      prisma as unknown as PrismaService,
      makeFakeRedisService() as unknown as RedisService,
      crypto,
      config,
    );
    variant = makeVariantRow({ sku: 'GADS-US-STD', price: '42.00' });
    prisma.productVariant.rows.push(variant);
  });

  describe('importLines', () => {
    it('encrypts each line, skips blanks, and recomputes stockCount', async () => {
      const report = await stock.importLines(variant.id, ['a:1', '', '  ', 'b:2', 'c:3']);
      expect(report).toEqual({ added: 3, skipped: 2, stockCount: 3 });
      expect(variant.stockCount).toBe(3);
      // Stored ciphertext is not the plaintext.
      expect(prisma.stockItem.rows.every((r) => !r.payload.includes(':'))).toBe(true);
      expect(prisma.stockItem.rows[0]!.payload.startsWith('v1.')).toBe(true);
    });

    it('is idempotent: re-importing the same file skips the duplicates', async () => {
      await stock.importLines(variant.id, ['a:1', 'b:2']);
      const report = await stock.importLines(variant.id, ['a:1', 'b:2', 'c:3']);
      expect(report).toEqual({ added: 1, skipped: 2, stockCount: 3 });
      expect(availableCount()).toBe(3);
    });
  });

  describe('reserve / release', () => {
    it('reserves available units and recomputes the cache', async () => {
      await stock.importLines(variant.id, ['a', 'b', 'c']);
      const ids = await stock.reserve(variant.id, 2, variant.sku);
      expect(ids).toHaveLength(2);
      expect(availableCount()).toBe(1);
      expect(variant.stockCount).toBe(1);

      await stock.release(ids);
      expect(availableCount()).toBe(3);
      expect(variant.stockCount).toBe(3);
    });

    it('throws OUT_OF_STOCK and releases the partial claim when short', async () => {
      await stock.importLines(variant.id, ['only']);
      await expect(stock.reserve(variant.id, 2, variant.sku)).rejects.toMatchObject({
        code: 'OUT_OF_STOCK',
      });
      // The one unit it grabbed is handed back — nothing stranded.
      expect(availableCount()).toBe(1);
      expect(variant.stockCount).toBe(1);
    });
  });

  describe('releaseOverdue sweep', () => {
    it('returns reserves past their TTL to available and recomputes', async () => {
      await stock.importLines(variant.id, ['a', 'b']);
      const [first] = prisma.stockItem.rows;
      // Simulate a reserve that expired a minute ago.
      Object.assign(first!, { status: 'reserved', reservedUntil: new Date(Date.now() - 60_000) });
      await stock.recomputeStockCount(prisma as unknown as PrismaService, variant.id);
      expect(variant.stockCount).toBe(1);

      const released = await stock.releaseOverdue();
      expect(released).toBe(1);
      expect(availableCount()).toBe(2);
      expect(variant.stockCount).toBe(2);
    });

    it('leaves still-valid reserves alone', async () => {
      await stock.importLines(variant.id, ['a']);
      const [only] = prisma.stockItem.rows;
      Object.assign(only!, { status: 'reserved', reservedUntil: new Date(Date.now() + 60_000) });
      const released = await stock.releaseOverdue();
      expect(released).toBe(0);
      expect(only!.status).toBe('reserved');
    });
  });
});
