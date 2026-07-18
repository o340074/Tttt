import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { WarmingService } from '../warming/warming.service';
import { aggregateOrderStatus } from '../warming/warming.logic';
import { IdempotencyService } from '../wallet/idempotency.service';
import { LedgerService } from '../wallet/ledger.service';
import { refundAmountForLine, type RefundLine } from '../warranty/refund.logic';
import type {
  AdminWarrantyClaimDetail,
  AdminWarrantyClaimListItem,
  Locale,
  Paginated,
  WarrantyClaimResult,
  WarrantyClaimStatus,
} from '@advault/types';

const FULFILL_ENDPOINT = 'admin.warranty.fulfill';

/** Claim + everything the queue/detail views and the fulfillment need. */
const CLAIM_INCLUDE = {
  orderItem: {
    select: {
      id: true,
      sku: true,
      nameSnapshot: true,
      unitPrice: true,
      quantity: true,
      deliveryType: true,
      deliveryStatus: true,
      variantId: true,
      variant: { select: { fulfillmentType: true } },
      order: {
        select: {
          id: true,
          number: true,
          currency: true,
          userId: true,
          // Discount + sibling line values drive the proportional refund
          // allocation (E10): a partial refund credits the line net of its
          // share of the promo discount, never the gross subtotal.
          discount: true,
          items: { select: { id: true, unitPrice: true, quantity: true } },
        },
      },
      warmingJob: { select: { id: true, status: true } },
    },
  },
  requester: { select: { email: true } },
} satisfies Prisma.WarrantyClaimInclude;

type ClaimWithRels = Prisma.WarrantyClaimGetPayload<{ include: typeof CLAIM_INCLUDE }>;

/**
 * Warranty claim triage & fulfillment (E10, docs/14). Support/managers/admins
 * read the queue and approve/reject; the money/asset *fulfillment* is narrowed
 * to FINANCE_STAFF on the controller. Fulfillment is the only money/asset step:
 *
 * - **replace**, READY_STOCK: reserve a fresh unit from the pool (same two-phase
 *   reserve as checkout, E5) and issue a `replacement` Delivery — the line
 *   becomes `replaced`.
 * - **replace**, MADE_TO_ORDER: re-open the warming job as a rework (E6); the
 *   line returns to `queued` and operators re-deliver from the workspace.
 * - **refund**: credit the line subtotal to the buyer's ledger (Decimal, double
 *   entry, docs/05); the line/job become `refunded`. Idempotent on the
 *   Idempotency-Key and on the per-line ledger unique.
 */
@Injectable()
export class AdminWarrantyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly stock: StockService,
    private readonly warming: WarmingService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    page: number,
    limit: number,
    status: WarrantyClaimStatus | undefined,
    locale: Locale,
  ): Promise<Paginated<AdminWarrantyClaimListItem>> {
    const where: Prisma.WarrantyClaimWhereInput = status ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.warrantyClaim.findMany({
        where,
        include: CLAIM_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.warrantyClaim.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.toListItem(r, locale)),
      meta: { total, page, limit },
    };
  }

  async get(id: string, locale: Locale): Promise<AdminWarrantyClaimDetail> {
    const row = await this.loadClaim(id);
    return this.toDetail(row, locale);
  }

  /** requested → approved (support decision; no money/asset yet). */
  async approve(
    actorId: string,
    id: string,
    note: string | undefined,
  ): Promise<WarrantyClaimResult> {
    const claim = await this.loadClaim(id);
    if (claim.status !== 'requested') {
      throw new ApiException('CONFLICT', 'Only a requested claim can be approved', 409, {
        status: claim.status,
      });
    }
    await this.prisma.warrantyClaim.update({
      where: { id },
      data: { status: 'approved', resolvedById: actorId, resolutionNote: note ?? null },
    });
    await this.audit.record({
      actorId,
      action: 'warranty.claim.approved',
      entity: 'WarrantyClaim',
      entityId: id,
      diff: { number: claim.number, ...(note ? { note } : {}) },
    });
    return this.result(id);
  }

  /** requested/approved → rejected (terminal). The buyer is notified. */
  async reject(
    actorId: string,
    id: string,
    note: string | undefined,
  ): Promise<WarrantyClaimResult> {
    const claim = await this.loadClaim(id);
    if (claim.status !== 'requested' && claim.status !== 'approved') {
      throw new ApiException('CONFLICT', 'This claim can no longer be rejected', 409, {
        status: claim.status,
      });
    }
    await this.prisma.warrantyClaim.update({
      where: { id },
      data: {
        status: 'rejected',
        resolvedById: actorId,
        resolutionNote: note ?? null,
        resolvedAt: new Date(),
      },
    });
    await this.audit.record({
      actorId,
      action: 'warranty.claim.rejected',
      entity: 'WarrantyClaim',
      entityId: id,
      diff: { number: claim.number, ...(note ? { note } : {}) },
    });
    await this.notify(claim, 'warrantyRejected');
    return this.result(id);
  }

  /**
   * approved → replaced | refunded. Idempotent on the actor's Idempotency-Key:
   * a replay returns the stored result. The claim-status guard and the per-line
   * ledger unique are the deeper guards against a double asset/credit.
   */
  async fulfill(actorId: string, id: string, idempotencyKey: string): Promise<WarrantyClaimResult> {
    const replay = await this.idempotency.claim(idempotencyKey, FULFILL_ENDPOINT, actorId, { id });
    if (replay) return replay.body as WarrantyClaimResult;
    try {
      const result = await this.performFulfill(actorId, id);
      await this.idempotency.saveResponse(idempotencyKey, FULFILL_ENDPOINT, 200, result);
      return result;
    } catch (error) {
      await this.idempotency.release(idempotencyKey, FULFILL_ENDPOINT);
      throw error;
    }
  }

  private async performFulfill(actorId: string, id: string): Promise<WarrantyClaimResult> {
    const claim = await this.loadClaim(id);
    if (claim.status !== 'approved') {
      throw new ApiException('CONFLICT', 'Only an approved claim can be fulfilled', 409, {
        status: claim.status,
      });
    }
    const item = claim.orderItem;
    const orderId = item.order.id;

    if (claim.type === 'refund') {
      // Credit what was actually paid for the line: its subtotal net of its
      // proportional share of the order's promo discount (E10). On an order
      // with no discount this equals the gross subtotal (unchanged behaviour).
      const amount = this.lineRefund(item);
      await this.prisma.$transaction(async (tx) => {
        // The ledger unique (refund, orderItemId) makes a second credit of the
        // same line impossible — it surfaces as a 409 CONFLICT.
        await this.ledger.credit(tx, {
          userId: item.order.userId,
          amount,
          refType: 'refund',
          refId: item.id,
        });
        await tx.orderItem.update({
          where: { id: item.id },
          data: { deliveryStatus: 'refunded' },
        });
        if (item.warmingJob) {
          await tx.warmingJob.update({
            where: { id: item.warmingJob.id },
            data: { status: 'refunded' },
          });
        }
        await tx.warrantyClaim.update({
          where: { id },
          data: { status: 'refunded', resolvedById: actorId, resolvedAt: new Date() },
        });
        await this.reaggregate(tx, orderId);
      });
      await this.audit.record({
        actorId,
        action: 'warranty.claim.refunded',
        entity: 'WarrantyClaim',
        entityId: id,
        diff: { number: claim.number, orderItemId: item.id, amount: amount.toFixed(2) },
      });
      await this.notify(claim, 'warrantyRefunded');
      return this.result(id);
    }

    // type === 'replace'
    if (item.variant.fulfillmentType === 'READY_STOCK') {
      // Two-phase: reserve outside the money transaction (E5), then convert.
      const reserved = await this.stock.reserve(item.variantId, 1, item.sku);
      try {
        await this.prisma.$transaction(async (tx) => {
          // Guard against a concurrent fulfill: only the approved→replaced flip wins.
          const flipped = await tx.warrantyClaim.updateMany({
            where: { id, status: 'approved' },
            data: { status: 'replaced', resolvedById: actorId, resolvedAt: new Date() },
          });
          if (flipped.count !== 1) {
            throw new ApiException('CONFLICT', 'Claim is no longer approved', 409);
          }
          const deliveryId = await this.stock.deliverReplacement(tx, reserved[0]!, item.id);
          await tx.warrantyClaim.update({
            where: { id },
            data: { replacementDeliveryId: deliveryId },
          });
          await tx.orderItem.update({
            where: { id: item.id },
            data: { deliveryStatus: 'replaced' },
          });
          await this.reaggregate(tx, orderId);
        });
      } catch (error) {
        await this.stock.release(reserved); // never strand the reserved unit
        throw error;
      }
      // A stock replacement is delivered synchronously → terminal now.
      await this.audit.record({
        actorId,
        action: 'warranty.claim.replaced',
        entity: 'WarrantyClaim',
        entityId: id,
        diff: { number: claim.number, orderItemId: item.id, fulfillment: 'READY_STOCK' },
      });
      await this.notify(claim, 'warrantyReplaced');
      return this.result(id);
    }

    // MADE_TO_ORDER: re-open the warm job as a rework. The replacement is not
    // done until an operator re-delivers, so the claim moves to `reworking`
    // (not the terminal `replaced`) and the buyer is notified only then — the
    // warming deliver transition flips reworking → replaced (E11 debt closed).
    if (!item.warmingJob) {
      throw new ApiException('CONFLICT', 'The line has no warming job to rework', 409);
    }
    await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.warrantyClaim.updateMany({
        where: { id, status: 'approved' },
        data: { status: 'reworking', resolvedById: actorId },
      });
      if (flipped.count !== 1) {
        throw new ApiException('CONFLICT', 'Claim is no longer approved', 409);
      }
      await this.warming.reworkForReplacement(tx, item.warmingJob!.id, item.id, orderId);
    });

    await this.audit.record({
      actorId,
      action: 'warranty.claim.rework_started',
      entity: 'WarrantyClaim',
      entityId: id,
      diff: { number: claim.number, orderItemId: item.id, fulfillment: 'MADE_TO_ORDER' },
    });
    return this.result(id);
  }

  // ---------- Internals ----------

  /**
   * The money a refund credits for this claim's line: its subtotal net of the
   * line's proportional share of the order promo discount (E10). Stable — it
   * depends only on the purchase-time line values, so it reads the same before
   * and after the refund and across sibling partial refunds.
   */
  private lineRefund(item: ClaimWithRels['orderItem']): Prisma.Decimal {
    const lines: RefundLine[] = item.order.items.map((l) => ({
      id: l.id,
      subtotal: l.unitPrice.times(l.quantity),
    }));
    return refundAmountForLine(lines, item.order.discount, item.id);
  }

  private async loadClaim(id: string): Promise<ClaimWithRels> {
    const row = await this.prisma.warrantyClaim.findUnique({
      where: { id },
      include: CLAIM_INCLUDE,
    });
    if (!row) throw new ApiException('NOT_FOUND', 'Warranty claim not found', 404);
    return row;
  }

  private async reaggregate(
    tx: Pick<Prisma.TransactionClient, 'orderItem' | 'order'>,
    orderId: string,
  ): Promise<void> {
    const siblings = await tx.orderItem.findMany({
      where: { orderId },
      select: { deliveryStatus: true },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { status: aggregateOrderStatus(siblings.map((s) => s.deliveryStatus)) },
    });
  }

  /** Notify the buyer of a resolution (best-effort; never blocks the tx). */
  private async notify(
    claim: ClaimWithRels,
    event: 'warrantyReplaced' | 'warrantyRefunded' | 'warrantyRejected',
  ): Promise<void> {
    await this.notifications.emit(
      claim.orderItem.order.userId,
      event,
      { number: claim.number },
      { claimId: claim.id, claimNumber: claim.number, orderNumber: claim.orderItem.order.number },
    );
  }

  private async result(id: string): Promise<WarrantyClaimResult> {
    const row = await this.loadClaim(id);
    const item = row.orderItem;
    const refunded = row.status === 'refunded' ? this.lineRefund(item).toFixed(2) : null;
    return {
      id: row.id,
      status: row.status,
      orderId: item.order.id,
      orderStatus: (await this.prisma.order.findUnique({
        where: { id: item.order.id },
        select: { status: true },
      }))!.status,
      orderItemId: item.id,
      itemStatus: item.deliveryStatus,
      refundedAmount: refunded,
      replacementDeliveryId: row.replacementDeliveryId,
    };
  }

  private toListItem(row: ClaimWithRels, locale: Locale): AdminWarrantyClaimListItem {
    const names = (row.orderItem.nameSnapshot ?? {}) as Partial<Record<Locale, string>>;
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      type: row.type,
      orderId: row.orderItem.order.id,
      orderNumber: row.orderItem.order.number,
      orderItemId: row.orderItemId,
      itemName: names[locale] ?? names.en ?? '',
      sku: row.orderItem.sku,
      deliveryType: row.orderItem.deliveryType,
      buyerEmail: row.requester.email,
      reason: row.reason,
      warrantyExpiresAt: row.warrantyExpiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    };
  }

  private toDetail(row: ClaimWithRels, locale: Locale): AdminWarrantyClaimDetail {
    return {
      ...this.toListItem(row, locale),
      resolutionNote: row.resolutionNote,
      // Discount-adjusted value of the line — the exact sum a refund credits.
      amount: this.lineRefund(row.orderItem).toFixed(2),
      currency: row.orderItem.order.currency,
      replacementDeliveryId: row.replacementDeliveryId,
    };
  }
}
