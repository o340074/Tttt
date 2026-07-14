import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PayloadCryptoService } from '../crypto/payload-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../wallet/idempotency.service';
import { LedgerService } from '../wallet/ledger.service';
import { aggregateOrderStatus } from '../warming/warming.logic';
import { AdminOrdersService } from './admin-orders.service';
import type {
  AdminOrderDetail,
  FinanceSummary,
  Locale,
  ManualDeliverRequest,
  RefundRequest,
  RefundResult,
} from '@advault/types';
import type { OrderItem as DbOrderItem } from '@prisma/client';

const ACCOUNTING_CURRENCY = 'USD';
const REFUND_ENDPOINT = 'admin.orders.refund';

/**
 * Money-touching / secret-writing actions on the order surface (docs/13 §2,§11).
 *
 * - Refunds credit the buyer's ledger (double entry, docs/05) keyed per order
 *   item, so each line is refunded at most once (the composite unique on
 *   LedgerEntry is the guard); a warm line's job is marked `refunded` too.
 * - Manual delivery encrypts the operator-entered payload exactly like stock
 *   (E5): only the owner can ever decrypt it, and no secret is logged.
 * - The finance summary reconciles the ledger truth against the cached balances.
 */
@Injectable()
export class AdminFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly crypto: PayloadCryptoService,
    private readonly idempotency: IdempotencyService,
    private readonly orders: AdminOrdersService,
  ) {}

  /**
   * Refund a single line (`orderItemId` set) or every not-yet-refunded line of
   * the order. Each refunded line credits its subtotal (unitPrice × quantity) to
   * the buyer's balance; discount allocation is deferred (docs/14, E10). A warm
   * line's job becomes `refunded`. The whole move runs in one transaction.
   *
   * Idempotent on the actor's Idempotency-Key: a replay returns the stored
   * result. The per-line ledger unique is the deeper guard against double refund.
   */
  async refund(
    actorId: string,
    orderId: string,
    body: RefundRequest,
    idempotencyKey: string,
  ): Promise<RefundResult> {
    const replay = await this.idempotency.claim(idempotencyKey, REFUND_ENDPOINT, actorId, {
      orderId,
      ...body,
    });
    if (replay) return replay.body as RefundResult;
    try {
      const result = await this.performRefund(actorId, orderId, body);
      await this.idempotency.saveResponse(idempotencyKey, REFUND_ENDPOINT, 200, result);
      return result;
    } catch (error) {
      await this.idempotency.release(idempotencyKey, REFUND_ENDPOINT);
      throw error;
    }
  }

  private async performRefund(
    actorId: string,
    orderId: string,
    body: RefundRequest,
  ): Promise<RefundResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { warmingJob: { select: { id: true, status: true } } } } },
    });
    if (!order) throw new ApiException('NOT_FOUND', 'Order not found', 404);

    let targets: (DbOrderItem & { warmingJob: { id: string; status: string } | null })[];
    if (body.orderItemId) {
      const item = order.items.find((i) => i.id === body.orderItemId);
      if (!item) throw new ApiException('NOT_FOUND', 'Order item not found', 404);
      if (item.deliveryStatus === 'refunded') {
        throw new ApiException('CONFLICT', 'This line is already refunded', 409);
      }
      targets = [item];
    } else {
      targets = order.items.filter((i) => i.deliveryStatus !== 'refunded');
      if (targets.length === 0) {
        throw new ApiException('CONFLICT', 'Nothing left to refund on this order', 409);
      }
    }

    let refunded = new Prisma.Decimal(0);
    await this.prisma.$transaction(async (tx) => {
      for (const item of targets) {
        const amount = item.unitPrice.times(item.quantity);
        // The ledger unique (refund, orderItemId) makes a second refund of the
        // same line impossible — it surfaces as a 409 CONFLICT.
        await this.ledger.credit(tx, {
          userId: order.userId,
          amount,
          refType: 'refund',
          refId: item.id,
        });
        await tx.orderItem.update({ where: { id: item.id }, data: { deliveryStatus: 'refunded' } });
        if (item.warmingJob) {
          await tx.warmingJob.update({
            where: { id: item.warmingJob.id },
            data: { status: 'refunded' },
          });
        }
        refunded = refunded.plus(amount);
      }
      const siblings = await tx.orderItem.findMany({
        where: { orderId },
        select: { deliveryStatus: true },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: aggregateOrderStatus(siblings.map((s) => s.deliveryStatus)) },
      });
    });

    const refundedItemIds = targets.map((i) => i.id);
    await this.audit.record({
      actorId,
      action: 'order.refund',
      entity: 'Order',
      entityId: orderId,
      diff: { refundedItemIds, amount: refunded.toFixed(2), reason: body.reason },
    });

    const fresh = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    return {
      orderId,
      status: fresh!.status,
      refundedItemIds,
      amount: refunded.toFixed(2),
      currency: order.currency,
    };
  }

  /**
   * Hand a line to the buyer by entering its payload manually (encrypted at
   * rest, decryptable only by the owner). For READY_STOCK / manual-entry lines;
   * warm lines are delivered from the warming workspace instead (409 here).
   */
  async manualDeliver(
    actorId: string,
    orderId: string,
    itemId: string,
    body: ManualDeliverRequest,
    locale: Locale,
  ): Promise<AdminOrderDetail> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
      include: { warmingJob: { select: { id: true } } },
    });
    if (!item) throw new ApiException('NOT_FOUND', 'Order item not found', 404);
    if (item.warmingJob) {
      throw new ApiException('CONFLICT', 'Deliver warm lines from the warming workspace', 409);
    }
    if (item.deliveryStatus === 'delivered' || item.deliveryStatus === 'replaced') {
      throw new ApiException('CONFLICT', 'This line is already delivered', 409);
    }
    if (item.deliveryStatus === 'refunded') {
      throw new ApiException('CONFLICT', 'This line was refunded', 409);
    }
    const payload = body.payload?.trim();
    if (!payload) {
      throw new ApiException('VALIDATION_ERROR', 'Delivery payload is required', 400, {
        fields: { payload: ['required'] },
      });
    }

    const ciphertext = this.crypto.encrypt(payload);
    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.create({
        data: {
          orderItemId: itemId,
          payload: ciphertext,
          type: 'manual',
          deliveredBy: actorId,
          deliveredAt: new Date(),
        },
      });
      await tx.orderItem.update({ where: { id: itemId }, data: { deliveryStatus: 'delivered' } });
      const siblings = await tx.orderItem.findMany({
        where: { orderId },
        select: { deliveryStatus: true },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: aggregateOrderStatus(siblings.map((s) => s.deliveryStatus)) },
      });
    });

    await this.audit.record({
      actorId,
      action: 'delivery.manual',
      entity: 'OrderItem',
      entityId: itemId,
      // Never log the secret payload — only its length and the optional note.
      diff: { orderId, length: payload.length, ...(body.note ? { note: body.note } : {}) },
    });

    return this.orders.get(orderId, locale);
  }

  /**
   * Ledger reconciliation + money totals (docs/13 §11). `reconciled` is true
   * when the ledger truth (SUM credit − SUM debit) equals the cached balances.
   */
  async summary(): Promise<FinanceSummary> {
    const [grouped, balanceAgg, orderCount, refundCount] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({
        by: ['direction', 'refType'],
        _sum: { amount: true },
      }),
      this.prisma.user.aggregate({ _sum: { balance: true } }),
      this.prisma.order.count(),
      this.prisma.ledgerEntry.count({ where: { direction: 'credit', refType: 'refund' } }),
    ]);

    const zero = new Prisma.Decimal(0);
    const sum = (direction: 'credit' | 'debit', refType: string): Prisma.Decimal =>
      grouped
        .filter((g) => g.direction === direction && g.refType === refType)
        .reduce((acc, g) => acc.plus(g._sum.amount ?? zero), zero);
    const totalCredit = grouped
      .filter((g) => g.direction === 'credit')
      .reduce((acc, g) => acc.plus(g._sum.amount ?? zero), zero);
    const totalDebit = grouped
      .filter((g) => g.direction === 'debit')
      .reduce((acc, g) => acc.plus(g._sum.amount ?? zero), zero);
    const ledgerBalance = totalCredit.minus(totalDebit);
    const cachedBalance = balanceAgg._sum.balance ?? zero;

    return {
      currency: ACCOUNTING_CURRENCY,
      topUps: sum('credit', 'topup').toFixed(2),
      orderSpend: sum('debit', 'order').toFixed(2),
      refunds: sum('credit', 'refund').toFixed(2),
      adjustments: sum('credit', 'adjustment').minus(sum('debit', 'adjustment')).toFixed(2),
      ledgerBalance: ledgerBalance.toFixed(2),
      cachedBalance: cachedBalance.toFixed(2),
      reconciled: ledgerBalance.equals(cachedBalance),
      orderCount,
      refundCount,
    };
  }
}
