import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PromoService } from '../cart/promo.service';
import { PayloadCryptoService } from '../crypto/payload-crypto.service';
import { StockService } from '../stock/stock.service';
import { IdempotencyService } from '../wallet/idempotency.service';
import { LedgerService } from '../wallet/ledger.service';
import {
  makeCategoryRow,
  makeFakeConfigService,
  makeFakePrismaService,
  makeFakeRedisService,
  makeProductRow,
  makeVariantRow,
  makeWarmingPlanRow,
} from '../testing/fakes';
import { OrdersService } from '../orders/orders.service';
import { WarmingService } from './warming.service';
import type { ProductVariant as DbVariant } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { LedgerTx } from '../wallet/ledger.service';

/**
 * WarmingService end-to-end over the in-memory fakes: a paid warm order walks
 * queued → assigned → in_progress (stages) → qc → ready → delivered, the bundle
 * lands in the buyer's Vault, and the fail/hold/refund branches behave.
 */
describe('WarmingService (E6 made-to-order)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let orders: OrdersService;
  let warming: WarmingService;
  let ledger: LedgerService;
  let crypto: PayloadCryptoService;
  let buyerId: string;
  let operatorId: string;
  let adminId: string;
  let variant: DbVariant;

  const STAGES = [
    { name: 'Environment prep', expectedMinutes: 240 },
    { name: 'Account setup', expectedMinutes: 240 },
    { name: 'Rest', expectedMinutes: 1440 },
    { name: 'QC + assembly', expectedMinutes: 480 },
  ];
  const PLAN_MINUTES = STAGES.reduce((sum, s) => sum + s.expectedMinutes, 0);
  const HOLD_BUFFER = 720;

  const seedWarmVariant = (): DbVariant => {
    const plan = makeWarmingPlanRow({ goal: 'google_ads', tier: 'warm_7d', stages: STAGES });
    prisma.warmingPlan.rows.push(plan);
    const category = makeCategoryRow({ slug: 'cat-warm' });
    const product = makeProductRow({ slug: 'product-warm', category, translations: [] });
    product.translations.push(
      { id: randomUUID(), productId: product.id, locale: 'en', name: 'Warm US', description: null },
      {
        id: randomUUID(),
        productId: product.id,
        locale: 'ru',
        name: 'Прогрев US',
        description: null,
      },
    );
    const row = makeVariantRow({
      sku: 'GADS-WARM-7D',
      price: '50.00',
      fulfillmentType: 'MADE_TO_ORDER',
      goal: 'google_ads',
      tier: 'warm_7d',
      warmingPlanId: plan.id,
      etaMinutes: PLAN_MINUTES,
      warrantyHours: 72,
      productId: product.id,
      bundleSpec: [{ type: 'ACCOUNT' }, { type: 'PROXY' }, { type: 'GUIDE' }, { type: 'WARRANTY' }],
      attributes: { name_en: 'Warm 7d', name_ru: 'Прогрев 7д' },
    });
    product.variants.push(row);
    prisma.product.rows.push(product);
    prisma.productVariant.rows.push(row);
    return row;
  };

  const creditBalance = async (userId: string, amount: string): Promise<void> => {
    await ledger.credit(prisma as unknown as LedgerTx, {
      userId,
      amount,
      refType: 'topup',
      refId: randomUUID(),
    });
  };

  const checkoutWarm = async (): Promise<{ orderId: string; itemId: string; jobId: string }> => {
    const cart = await prisma.cart.create({ data: { userId: buyerId } });
    await prisma.cartItem.create({ data: { cartId: cart.id, variantId: variant.id, quantity: 1 } });
    const order = await orders.checkout(buyerId, {}, randomUUID(), 'en');
    const job = prisma.warmingJob.rows.find((j) => j.orderItemId === order.items[0]!.id)!;
    return { orderId: order.id, itemId: order.items[0]!.id, jobId: job.id };
  };

  /** Mark every stage task done so the job may advance to qc. */
  const finishAllStages = async (jobId: string): Promise<void> => {
    const tasks = prisma.warmingTask.rows.filter((t) => t.jobId === jobId);
    for (const task of tasks) {
      await warming.updateTask(operatorId, jobId, task.id, { status: 'done' }, 'en');
    }
  };

  beforeEach(async () => {
    prisma = makeFakePrismaService();
    const config = makeFakeConfigService();
    ledger = new LedgerService();
    crypto = new PayloadCryptoService(config);
    const audit = new AuditService(prisma as unknown as PrismaService);
    warming = new WarmingService(prisma as unknown as PrismaService, crypto, audit, ledger, config);
    const stock = new StockService(
      prisma as unknown as PrismaService,
      makeFakeRedisService() as unknown as RedisService,
      crypto,
      config,
    );
    orders = new OrdersService(
      prisma as unknown as PrismaService,
      ledger,
      new PromoService(prisma as unknown as PrismaService),
      new IdempotencyService(prisma as unknown as PrismaService),
      stock,
      crypto,
      audit,
      warming,
    );
    const buyer = await prisma.user.create({
      data: { email: 'buyer@advault.dev', passwordHash: 'x' },
    });
    buyerId = buyer.id;
    const operator = await prisma.user.create({
      data: { email: 'op@advault.dev', passwordHash: 'x', role: 'support' },
    });
    operatorId = operator.id;
    const admin = await prisma.user.create({
      data: { email: 'admin@advault.dev', passwordHash: 'x', role: 'admin' },
    });
    adminId = admin.id;
    variant = seedWarmVariant();
    await creditBalance(buyerId, '100.00');
  });

  it('creates a queued job with plan stages and a plan-derived ETA at checkout', async () => {
    const { itemId, jobId } = await checkoutWarm();
    const job = prisma.warmingJob.rows.find((j) => j.id === jobId)!;
    expect(job.status).toBe('queued');
    expect(job.stageCount).toBe(STAGES.length);
    expect(prisma.warmingTask.rows.filter((t) => t.jobId === jobId)).toHaveLength(STAGES.length);

    const etaMinutes = (job.etaAt!.getTime() - job.createdAt.getTime()) / 60_000;
    expect(Math.round(etaMinutes)).toBe(PLAN_MINUTES);

    // The order reflects the line status and buyer progress.
    const detail = await warming.getJob(jobId, 'en');
    expect(detail.orderItemId).toBe(itemId);
    expect(detail.tasks).toHaveLength(STAGES.length);
  });

  it('runs the full cycle to delivery and drops the bundle in the buyer Vault', async () => {
    const { orderId, itemId, jobId } = await checkoutWarm();

    await warming.assign(adminId, jobId, operatorId, 'en');
    expect(prisma.warmingJob.rows[0]!.status).toBe('assigned');

    await warming.transition(operatorId, jobId, 'start', undefined, 'en');
    expect(prisma.warmingJob.rows[0]!.startedAt).not.toBeNull();

    await finishAllStages(jobId);
    expect(prisma.warmingJob.rows[0]!.currentStage).toBe(STAGES.length);

    await warming.transition(operatorId, jobId, 'qc', undefined, 'en');
    await warming.transition(operatorId, jobId, 'ready', undefined, 'en');

    // Cannot deliver before the account data is captured.
    await expect(warming.transition(operatorId, jobId, 'deliver', undefined, 'en')).rejects.toThrow(
      ApiException,
    );

    await warming.setAccountAsset(
      operatorId,
      jobId,
      { payload: 'login: warm@ex.io\npass: S3cr3t', recovery: 'rec@ex.io' },
      'en',
    );
    // Stored ciphertext, never plaintext.
    expect(prisma.accountAsset.rows[0]!.payload).not.toContain('warm@ex.io');

    await warming.transition(operatorId, jobId, 'deliver', undefined, 'en');
    const job = prisma.warmingJob.rows[0]!;
    expect(job.status).toBe('delivered');
    expect(prisma.bundle.rows).toHaveLength(1);
    expect(prisma.bundle.rows[0]!.status).toBe('delivered');
    // One component per bundleSpec entry.
    expect(prisma.bundleComponent.rows).toHaveLength(4);
    // Warm delivery written for the line.
    const warmDelivery = prisma.delivery.rows.find((d) => d.type === 'warm');
    expect(warmDelivery).toBeTruthy();

    // Order and line aggregate to delivered.
    const order = await orders.getOrder(buyerId, orderId, 'en');
    expect(order.status).toBe('delivered');
    expect(order.items[0]!.deliveryStatus).toBe('delivered');
    expect(order.items[0]!.warming?.status).toBe('delivered');

    // The owner decrypts the assembled bundle; a stranger gets a 404.
    const delivery = await orders.getDelivery(buyerId, orderId, itemId);
    expect(delivery.type).toBe('warm');
    expect(delivery.payload).toContain('ACCOUNT');
    expect(delivery.payload).toContain('warm@ex.io');
    await expect(orders.getDelivery(randomUUID(), orderId, itemId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('recomputes the ETA with a buffer on hold and shrinks it on resume', async () => {
    const { jobId } = await checkoutWarm();
    await warming.assign(adminId, jobId, operatorId, 'en');
    await warming.transition(operatorId, jobId, 'start', undefined, 'en');
    // Complete the first stage so remaining < full plan.
    const first = prisma.warmingTask.rows.find((t) => t.jobId === jobId && t.order === 0)!;
    await warming.updateTask(operatorId, jobId, first.id, { status: 'done' }, 'en');

    const remainingAfterFirst = PLAN_MINUTES - STAGES[0]!.expectedMinutes;

    await warming.transition(operatorId, jobId, 'hold', 'waiting on proxy', 'en');
    // Snapshot the value now — the fake mutates the row object in place on resume.
    const heldEtaMs = prisma.warmingJob.rows[0]!.etaAt!.getTime();
    const heldMinutes = (heldEtaMs - Date.now()) / 60_000;
    expect(Math.round(heldMinutes)).toBe(remainingAfterFirst + HOLD_BUFFER);

    await warming.transition(operatorId, jobId, 'resume', undefined, 'en');
    const resumedEtaMs = prisma.warmingJob.rows[0]!.etaAt!.getTime();
    const resumedMinutes = (resumedEtaMs - Date.now()) / 60_000;
    expect(Math.round(resumedMinutes)).toBe(remainingAfterFirst);
    expect(resumedEtaMs).toBeLessThan(heldEtaMs);
  });

  it('refunds the line to the buyer balance when a failed job is refunded', async () => {
    const { orderId, jobId } = await checkoutWarm();
    expect((await prisma.user.findUnique({ where: { id: buyerId } }))!.balance.toFixed(2)).toBe(
      '50.00',
    );

    await warming.assign(adminId, jobId, operatorId, 'en');
    await warming.transition(operatorId, jobId, 'fail', 'account banned', 'en');
    expect(prisma.warmingJob.rows[0]!.status).toBe('failed');

    await warming.resolveFailed(adminId, jobId, 'refund', 'unrecoverable', 'en');
    expect(prisma.warmingJob.rows[0]!.status).toBe('refunded');

    // Balance restored; a refund ledger entry posted once.
    expect((await prisma.user.findUnique({ where: { id: buyerId } }))!.balance.toFixed(2)).toBe(
      '100.00',
    );
    expect(prisma.ledgerEntry.rows.filter((e) => e.refType === 'refund')).toHaveLength(1);

    const order = await orders.getOrder(buyerId, orderId, 'en');
    expect(order.status).toBe('refunded');
    expect(order.items[0]!.deliveryStatus).toBe('refunded');
  });

  it('reassigns a failed job back to the queue with a reset ETA and tasks', async () => {
    const { jobId } = await checkoutWarm();
    await warming.assign(adminId, jobId, operatorId, 'en');
    await warming.transition(operatorId, jobId, 'start', undefined, 'en');
    const first = prisma.warmingTask.rows.find((t) => t.jobId === jobId && t.order === 0)!;
    await warming.updateTask(operatorId, jobId, first.id, { status: 'done' }, 'en');
    await warming.transition(operatorId, jobId, 'fail', undefined, 'en');

    await warming.resolveFailed(adminId, jobId, 'reassign', undefined, 'en');
    const job = prisma.warmingJob.rows[0]!;
    expect(job.status).toBe('queued');
    expect(job.assignedTo).toBeNull();
    expect(job.currentStage).toBe(0);
    expect(prisma.warmingTask.rows.every((t) => t.status === 'pending')).toBe(true);
    // No money moved on a reassign.
    expect(prisma.ledgerEntry.rows.filter((e) => e.refType === 'refund')).toHaveLength(0);
  });

  it('rejects illegal transitions and non-operator assignees', async () => {
    const { jobId } = await checkoutWarm();
    // Deliver straight from queued is not allowed.
    await expect(
      warming.transition(operatorId, jobId, 'deliver', undefined, 'en'),
    ).rejects.toMatchObject({ status: 409 });
    // Assigning to a plain buyer is rejected.
    await expect(warming.assign(adminId, jobId, buyerId, 'en')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('lists the operator queue oldest-first with filters', async () => {
    const { jobId } = await checkoutWarm();
    const queue = await warming.listJobs({ status: 'queued' }, 1, 20, 'en');
    expect(queue.meta.total).toBe(1);
    expect(queue.data[0]!.id).toBe(jobId);
    expect(queue.data[0]!.goal).toBe('google_ads');
    expect(queue.data[0]!.tier).toBe('warm_7d');
    // Filtering by a different status yields nothing.
    const none = await warming.listJobs({ status: 'delivered' }, 1, 20, 'en');
    expect(none.meta.total).toBe(0);
  });
});
