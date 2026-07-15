import { Test } from '@nestjs/testing';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import {
  makeCategoryRow,
  makeFakePrismaService,
  makeFakeRedisService,
  makeProductRow,
  makeVariantRow,
  makeWarmingPlanRow,
} from '../src/testing/fakes';
import type { INestApplication } from '@nestjs/common';
import type { ProductVariant as DbVariant } from '@prisma/client';

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? '';
const sign = (raw: string): string =>
  createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');

/**
 * Smoke: the E6 warming path over HTTP — pay a made-to-order line (job queued
 * with an ETA) → operator (admin/support) walks it through the stages →
 * delivered → the assembled bundle lands in the buyer's Vault. RBAC keeps the
 * operator routes off-limits to buyers.
 */
describe('Warming pipeline smoke (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const prisma = makeFakePrismaService();

  let buyerToken = '';
  let adminToken = '';
  let adminId = '';
  let warmVariant: DbVariant;
  let orderId = '';
  let orderItemId = '';
  let jobId = '';
  const STAGE_COUNT = 4;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(makeFakeRedisService())
      .compile();
    app = configureApp(moduleRef.createNestApplication({ rawBody: true }));
    await app.init();
    http = app.getHttpServer();

    // Warm variant linked to a 4-stage plan.
    const plan = makeWarmingPlanRow({
      goal: 'google_ads',
      tier: 'warm_7d',
      name: 'Google Ads · Warm 7d',
      stages: [
        { name: 'Environment prep', expectedMinutes: 240 },
        { name: 'Account setup', expectedMinutes: 240 },
        { name: 'Rest', expectedMinutes: 4320 },
        { name: 'QC + assembly', expectedMinutes: 480 },
      ],
    });
    prisma.warmingPlan.rows.push(plan);

    const category = makeCategoryRow({ slug: 'google-ads' });
    const product = makeProductRow({ slug: 'google-ads-warm', category });
    product.translations.push(
      {
        id: randomUUID(),
        productId: product.id,
        locale: 'en',
        name: 'Google Ads — warmed',
        description: null,
      },
      {
        id: randomUUID(),
        productId: product.id,
        locale: 'ru',
        name: 'Google Ads — прогрев',
        description: null,
      },
    );
    warmVariant = makeVariantRow({
      sku: 'GADS-WARM-7D',
      price: '80.00',
      productId: product.id,
      fulfillmentType: 'MADE_TO_ORDER',
      goal: 'google_ads',
      tier: 'warm_7d',
      warmingPlanId: plan.id,
      etaMinutes: 240 + 240 + 4320 + 480,
      warrantyHours: 72,
      bundleSpec: [{ type: 'ACCOUNT' }, { type: 'PROXY' }, { type: 'GUIDE' }, { type: 'WARRANTY' }],
      attributes: { name_en: 'Warm 7d', name_ru: 'Прогрев 7д' },
    });
    product.variants.push(warmVariant);
    prisma.product.rows.push(product);
    prisma.productVariant.rows.push(warmVariant);

    // Buyer.
    const buyer = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: 'warm-buyer@advault.dev', password: 'password-123' })
      .expect(201);
    buyerToken = buyer.body.accessToken;

    // Admin/operator.
    await request(http)
      .post('/api/v1/auth/register')
      .send({ email: 'warm-admin@advault.dev', password: 'password-123' })
      .expect(201);
    const adminRow = prisma.user.rows.find((u) => u.email === 'warm-admin@advault.dev')!;
    adminRow.role = 'admin';
    adminId = adminRow.id;
    const adminLogin = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: 'warm-admin@advault.dev', password: 'password-123' })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    // Fund the buyer via the E3 webhook.
    await request(http)
      .post('/api/v1/wallet/topups')
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '100.00', asset: 'USDT-TRC20' })
      .expect(201);
    const externalId = prisma.topUp.rows[0]!.externalId!;
    const raw = JSON.stringify({ externalId, status: 'paid' });
    await request(http)
      .post('/api/v1/webhooks/payments/sandbox')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sign(raw))
      .send(raw)
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  const buyer = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${buyerToken}`);
  const admin = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${adminToken}`);

  it('checks out a warm line: order paid, line queued with an ETA and stage progress', async () => {
    await buyer(request(http).post('/api/v1/cart/items'))
      .send({ variantId: warmVariant.id, quantity: 1 })
      .expect(201);

    const res = await buyer(request(http).post('/api/v1/orders/checkout'))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    expect(res.body.status).toBe('paid');
    const item = res.body.items[0];
    expect(item.deliveryStatus).toBe('queued');
    expect(item.warming).toMatchObject({ status: 'queued', totalStages: STAGE_COUNT });
    expect(item.warming.etaAt).toBeTruthy();
    orderId = res.body.id;
    orderItemId = item.id;
  });

  it('keeps the operator queue off-limits to buyers (RBAC 403)', async () => {
    const res = await buyer(request(http).get('/api/v1/admin/warming/jobs')).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('shows the job in the operator queue', async () => {
    const res = await admin(request(http).get('/api/v1/admin/warming/jobs?status=queued')).expect(
      200,
    );
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      orderItemId,
      sku: 'GADS-WARM-7D',
      goal: 'google_ads',
      tier: 'warm_7d',
      status: 'queued',
      stageCount: STAGE_COUNT,
    });
    jobId = res.body.data[0].id;
  });

  it('walks the job through assign → start → stages → qc → ready', async () => {
    await admin(request(http).post(`/api/v1/admin/warming/jobs/${jobId}/assign`))
      .send({ operatorId: adminId })
      .expect(200);
    await admin(request(http).post(`/api/v1/admin/warming/jobs/${jobId}/transition`))
      .send({ action: 'start' })
      .expect(200);

    const detail = await admin(request(http).get(`/api/v1/admin/warming/jobs/${jobId}`)).expect(
      200,
    );
    for (const task of detail.body.tasks) {
      await admin(request(http).post(`/api/v1/admin/warming/jobs/${jobId}/tasks/${task.id}`))
        .send({ status: 'done' })
        .expect(200);
    }

    await admin(request(http).post(`/api/v1/admin/warming/jobs/${jobId}/transition`))
      .send({ action: 'qc' })
      .expect(200);
    const ready = await admin(request(http).post(`/api/v1/admin/warming/jobs/${jobId}/transition`))
      .send({ action: 'ready' })
      .expect(200);
    expect(ready.body.status).toBe('ready');
  });

  it('refuses to deliver before the account data is captured (409)', async () => {
    const res = await admin(request(http).post(`/api/v1/admin/warming/jobs/${jobId}/transition`))
      .send({ action: 'deliver' })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('captures the account data and delivers the bundle', async () => {
    await admin(request(http).post(`/api/v1/admin/warming/jobs/${jobId}/account`))
      .send({ payload: 'login: warm@ex.io\npass: S3cret!', recovery: 'rec@ex.io' })
      .expect(200);
    // Ciphertext at rest, never plaintext.
    expect(prisma.accountAsset.rows[0]!.payload).not.toContain('warm@ex.io');

    const delivered = await admin(
      request(http).post(`/api/v1/admin/warming/jobs/${jobId}/transition`),
    )
      .send({ action: 'deliver' })
      .expect(200);
    expect(delivered.body.status).toBe('delivered');
    expect(prisma.bundle.rows).toHaveLength(1);

    // E9: delivery to the Vault notifies the buyer ("your account is ready").
    const notifs = await buyer(request(http).get('/api/v1/notifications')).expect(200);
    expect(
      notifs.body.data.some(
        (n: { type: string; data: { orderId?: string } }) =>
          n.type === 'warming_ready' && n.data.orderId === orderId,
      ),
    ).toBe(true);
  });

  it('shows the buyer the delivered warm order and the bundle in the Vault', async () => {
    const order = await buyer(request(http).get(`/api/v1/orders/${orderId}`)).expect(200);
    expect(order.body.status).toBe('delivered');
    expect(order.body.items[0].deliveryStatus).toBe('delivered');
    expect(order.body.items[0].warming.status).toBe('delivered');

    const delivery = await buyer(
      request(http).get(`/api/v1/orders/${orderId}/items/${orderItemId}/delivery`),
    ).expect(200);
    expect(delivery.body.type).toBe('warm');
    expect(delivery.body.payload).toContain('ACCOUNT');
    expect(delivery.body.payload).toContain('warm@ex.io');
    expect(
      prisma.auditLog.rows.filter((r) => r.action === 'delivery.payload_accessed'),
    ).toHaveLength(1);
  });

  it('keeps the admin orders table off-limits to buyers (RBAC 403)', async () => {
    const res = await buyer(request(http).get('/api/v1/admin/orders')).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lists the order in the admin table with the buyer and filters by number/status', async () => {
    const all = await admin(request(http).get('/api/v1/admin/orders')).expect(200);
    expect(all.body.meta.total).toBe(1);
    const row = all.body.data[0];
    expect(row).toMatchObject({ id: orderId, status: 'delivered', itemCount: 1 });
    expect(row.buyer.email).toBe('warm-buyer@advault.dev');

    // Free-text on the buyer email; status filter narrows the set.
    const byEmail = await admin(request(http).get('/api/v1/admin/orders?q=warm-buyer')).expect(200);
    expect(byEmail.body.meta.total).toBe(1);
    const wrongStatus = await admin(
      request(http).get('/api/v1/admin/orders?status=refunded'),
    ).expect(200);
    expect(wrongStatus.body.meta.total).toBe(0);
  });

  it('returns the full admin order detail with warming progress (no secrets)', async () => {
    const res = await admin(request(http).get(`/api/v1/admin/orders/${orderId}`)).expect(200);
    expect(res.body).toMatchObject({ number: expect.any(String), status: 'delivered' });
    expect(res.body.buyer.email).toBe('warm-buyer@advault.dev');
    expect(res.body.items[0].warming.status).toBe('delivered');
    // The admin surface never carries a decrypted delivery payload.
    expect(JSON.stringify(res.body)).not.toContain('warm@ex.io');
  });

  it('404s an unknown admin order id', async () => {
    const res = await admin(request(http).get(`/api/v1/admin/orders/${randomUUID()}`)).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
