import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PayloadCryptoService } from '../crypto/payload-crypto.service';
import { IdempotencyService } from '../wallet/idempotency.service';
import { LedgerService } from '../wallet/ledger.service';
import { makeFakeConfigService, makeFakePrismaService } from '../testing/fakes';
import { AdminFinanceService } from './admin-finance.service';
import type { AdminOrdersService } from './admin-orders.service';
import type { OrderItem as DbOrderItem } from '@prisma/client';

/**
 * AdminFinanceService over the in-memory fakes: refunds credit the ledger once
 * per line (idempotently), a warm line's job becomes refunded, manual delivery
 * encrypts the operator's payload and completes the line, and the summary
 * reconciles the ledger against the cached balances.
 */
describe('AdminFinanceService (E8 finance)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let finance: AdminFinanceService;
  let ordersStub: { get: ReturnType<typeof vi.fn> };
  let buyerId: string;
  let adminId: string;

  const seedBuyer = (balance = '0.00'): string => {
    const id = randomUUID();
    prisma.user.rows.push({
      id,
      email: `buyer-${id}@example.com`,
      passwordHash: 'x',
      role: 'user',
      status: 'active',
      balance: new Prisma.Decimal(balance),
      locale: 'en',
      emailVerifiedAt: null,
      twoFactorSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  };

  const seedOrder = (
    userId: string,
    items: { unitPrice: string; quantity: number; deliveryStatus: DbOrderItem['deliveryStatus'] }[],
  ): { id: string; itemIds: string[] } => {
    const orderId = randomUUID();
    prisma.order.rows.push({
      id: orderId,
      userId,
      number: `AV-2026-${Math.floor(Math.random() * 1_000_000)}`,
      status: 'paid',
      subtotal: new Prisma.Decimal('0'),
      discount: new Prisma.Decimal('0'),
      total: new Prisma.Decimal('0'),
      currency: 'USD',
      promoCodeId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const itemIds = items.map((item) => {
      const itemId = randomUUID();
      prisma.orderItem.rows.push({
        id: itemId,
        orderId,
        variantId: randomUUID(),
        sku: 'SKU',
        nameSnapshot: { en: 'Item' },
        quantity: item.quantity,
        unitPrice: new Prisma.Decimal(item.unitPrice),
        deliveryType: 'manual',
        deliveryStatus: item.deliveryStatus,
      });
      return itemId;
    });
    return { id: orderId, itemIds };
  };

  beforeEach(() => {
    prisma = makeFakePrismaService();
    const ledger = new LedgerService();
    const audit = new AuditService(prisma);
    const crypto = new PayloadCryptoService(makeFakeConfigService());
    const idempotency = new IdempotencyService(prisma);
    ordersStub = { get: vi.fn().mockResolvedValue({ id: 'x' }) };
    finance = new AdminFinanceService(
      prisma,
      ledger,
      audit,
      crypto,
      idempotency,
      ordersStub as unknown as AdminOrdersService,
    );
    buyerId = seedBuyer('0.00');
    adminId = randomUUID();
  });

  describe('refund', () => {
    it('refunds a single line once and rejects a second refund of it', async () => {
      const order = seedOrder(buyerId, [
        { unitPrice: '10.00', quantity: 1, deliveryStatus: 'delivered' },
        { unitPrice: '25.00', quantity: 2, deliveryStatus: 'pending' },
      ]);

      const result = await finance.refund(
        adminId,
        order.id,
        { orderItemId: order.itemIds[0], reason: 'customer complaint' },
        'key-1',
      );

      expect(result.amount).toBe('10.00');
      expect(result.refundedItemIds).toEqual([order.itemIds[0]]);
      expect(prisma.user.rows[0]!.balance.toFixed(2)).toBe('10.00');
      // Second refund of the same line is a conflict (ledger unique guard).
      await expect(
        finance.refund(
          adminId,
          order.id,
          { orderItemId: order.itemIds[0], reason: 'again' },
          'key-2',
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('refunds every not-yet-refunded line for a whole-order refund', async () => {
      const order = seedOrder(buyerId, [
        { unitPrice: '10.00', quantity: 1, deliveryStatus: 'delivered' },
        { unitPrice: '25.00', quantity: 2, deliveryStatus: 'refunded' }, // already refunded → skipped
        { unitPrice: '5.00', quantity: 3, deliveryStatus: 'pending' },
      ]);

      const result = await finance.refund(adminId, order.id, { reason: 'goodwill' }, 'key-1');

      // 10.00 + 15.00 = 25.00; the already-refunded line is untouched.
      expect(result.amount).toBe('25.00');
      expect(result.refundedItemIds).toHaveLength(2);
      expect(result.status).toBe('refunded');
      expect(prisma.user.rows[0]!.balance.toFixed(2)).toBe('25.00');
    });

    it('marks a refunded warm line as refunded on its job', async () => {
      const order = seedOrder(buyerId, [
        { unitPrice: '50.00', quantity: 1, deliveryStatus: 'ready' },
      ]);
      await prisma.warmingJob.create({
        data: { orderItemId: order.itemIds[0]!, planVersion: 1, status: 'ready' },
      });

      await finance.refund(adminId, order.id, { reason: 'defective' }, 'key-1');

      expect(prisma.warmingJob.rows[0]!.status).toBe('refunded');
    });

    it('replays the stored result for the same Idempotency-Key without double crediting', async () => {
      const order = seedOrder(buyerId, [
        { unitPrice: '30.00', quantity: 1, deliveryStatus: 'pending' },
      ]);

      const first = await finance.refund(adminId, order.id, { reason: 'once' }, 'same-key');
      const replay = await finance.refund(adminId, order.id, { reason: 'once' }, 'same-key');

      expect(replay).toEqual(first);
      expect(prisma.user.rows[0]!.balance.toFixed(2)).toBe('30.00'); // credited once
      expect(prisma.ledgerEntry.rows).toHaveLength(1);
    });

    it('409s when nothing is left to refund', async () => {
      const order = seedOrder(buyerId, [
        { unitPrice: '10.00', quantity: 1, deliveryStatus: 'refunded' },
      ]);
      await expect(
        finance.refund(adminId, order.id, { reason: 'x' }, 'key-1'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('manualDeliver', () => {
    it('encrypts the payload, creates a manual delivery and completes the line', async () => {
      const order = seedOrder(buyerId, [
        { unitPrice: '10.00', quantity: 1, deliveryStatus: 'pending' },
      ]);

      await finance.manualDeliver(
        adminId,
        order.id,
        order.itemIds[0]!,
        { payload: 'login:pass\nnotes', note: 'entered by hand' },
        'en',
      );

      const delivery = prisma.delivery.rows[0]!;
      expect(delivery.type).toBe('manual');
      expect(delivery.payload).not.toContain('login:pass'); // stored ciphertext
      expect(prisma.orderItem.rows[0]!.deliveryStatus).toBe('delivered');
      expect(prisma.order.rows[0]!.status).toBe('delivered');
      // The audit note must never carry the secret payload.
      const audit = prisma.auditLog.rows.find((a) => a.action === 'delivery.manual')!;
      expect(JSON.stringify(audit.diff)).not.toContain('login:pass');
    });

    it('refuses to manually deliver a warm line (use the warming workspace)', async () => {
      const order = seedOrder(buyerId, [
        { unitPrice: '50.00', quantity: 1, deliveryStatus: 'ready' },
      ]);
      await prisma.warmingJob.create({
        data: { orderItemId: order.itemIds[0]!, planVersion: 1, status: 'ready' },
      });

      await expect(
        finance.manualDeliver(adminId, order.id, order.itemIds[0]!, { payload: 'x' }, 'en'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('refuses to deliver an already-delivered line', async () => {
      const order = seedOrder(buyerId, [
        { unitPrice: '10.00', quantity: 1, deliveryStatus: 'delivered' },
      ]);
      await expect(
        finance.manualDeliver(adminId, order.id, order.itemIds[0]!, { payload: 'x' }, 'en'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('404s for a line that does not belong to the order', async () => {
      const order = seedOrder(buyerId, [
        { unitPrice: '10.00', quantity: 1, deliveryStatus: 'pending' },
      ]);
      await expect(
        finance.manualDeliver(adminId, order.id, randomUUID(), { payload: 'x' }, 'en'),
      ).rejects.toBeInstanceOf(ApiException);
    });
  });

  describe('summary', () => {
    it('reconciles the ledger against the cached balances', async () => {
      const order = seedOrder(buyerId, [
        { unitPrice: '30.00', quantity: 1, deliveryStatus: 'pending' },
      ]);
      // A top-up credit and an order debit, then a refund credit.
      await prisma.$transaction(async (tx) => {
        await new LedgerService().credit(tx, {
          userId: buyerId,
          amount: '100.00',
          refType: 'topup',
          refId: randomUUID(),
        });
        await new LedgerService().debit(tx, {
          userId: buyerId,
          amount: '30.00',
          refType: 'order',
          refId: order.id,
        });
      });
      await finance.refund(adminId, order.id, { reason: 'x' }, 'key-1');

      const summary = await finance.summary();
      expect(summary.topUps).toBe('100.00');
      expect(summary.orderSpend).toBe('30.00');
      expect(summary.refunds).toBe('30.00');
      expect(summary.reconciled).toBe(true);
      expect(summary.ledgerBalance).toBe('100.00');
      expect(summary.refundCount).toBe(1);
    });
  });
});
