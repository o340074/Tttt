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
 * Smoke (E7): a made-to-order line is paid → an operator prepares it, binds a
 * real proxy and Octo profile from the inventory → delivered → the buyer's
 * Vault bundle carries the decrypted proxy credentials and Octo export. RBAC
 * keeps the inventory endpoints off-limits to buyers; secrets stay encrypted.
 */
describe('Inventory: proxy + Octo bound into the warm bundle (e2e)', () => {
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
  const STAGE_COUNT = 3;

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

    const plan = makeWarmingPlanRow({
      goal: 'google_ads',
      tier: 'warm_7d',
      name: 'Google Ads · Warm 7d',
      stages: [
        { name: 'Environment prep', expectedMinutes: 240 },
        { name: 'Account setup', expectedMinutes: 240 },
        { name: 'QC + assembly', expectedMinutes: 480 },
      ],
    });
    prisma.warmingPlan.rows.push(plan);

    const category = makeCategoryRow({ slug: 'google-ads' });
    const product = makeProductRow({ slug: 'google-ads-warm-kit', category });
    product.translations.push({
      id: randomUUID(),
      productId: product.id,
      locale: 'en',
      name: 'Google Ads — warmed kit',
      description: null,
    });
    warmVariant = makeVariantRow({
      sku: 'GADS-WARM-KIT',
      price: '80.00',
      productId: product.id,
      fulfillmentType: 'MADE_TO_ORDER',
      goal: 'google_ads',
      tier: 'warm_7d',
      warmingPlanId: plan.id,
      etaMinutes: 960,
      warrantyHours: 72,
      bundleSpec: [
        { type: 'ACCOUNT' },
        { type: 'PROXY' },
        { type: 'OCTO_PROFILE' },
        { type: 'GUIDE' },
        { type: 'WARRANTY' },
      ],
      attributes: { name_en: 'Warm kit', name_ru: 'Комплект' },
    });
    product.variants.push(warmVariant);
    prisma.product.rows.push(product);
    prisma.productVariant.rows.push(warmVariant);

    const buyer = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: 'kit-buyer@advault.dev', password: 'password-123' })
      .expect(201);
    buyerToken = buyer.body.accessToken;

    await request(http)
      .post('/api/v1/auth/register')
      .send({ email: 'kit-admin@advault.dev', password: 'password-123' })
      .expect(201);
    const adminRow = prisma.user.rows.find((u) => u.email === 'kit-admin@advault.dev')!;
    adminRow.role = 'admin';
    adminId = adminRow.id;
    const adminLogin = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: 'kit-admin@advault.dev', password: 'password-123' })
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

  it('pays for the warm kit and prepares the job up to ready', async () => {
    await buyer(request(http).post('/api/v1/cart/items'))
      .send({ variantId: warmVariant.id, quantity: 1 })
      .expect(201);
    const res = await buyer(request(http).post('/api/v1/orders/checkout'))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    orderId = res.body.id;
    orderItemId = res.body.items[0].id;

    const queue = await admin(request(http).get('/api/v1/admin/warming/jobs?status=queued')).expect(
      200,
    );
    jobId = queue.body.data[0].id;

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
    await admin(request(http).post(`/api/v1/admin/warming/jobs/${jobId}/transition`))
      .send({ action: 'ready' })
      .expect(200);
    await admin(request(http).post(`/api/v1/admin/warming/jobs/${jobId}/account`))
      .send({ payload: 'login: kit@ex.io\npass: S3cr3t' })
      .expect(200);
    expect(STAGE_COUNT).toBe(detail.body.tasks.length);
  });

  it('keeps the inventory endpoints off-limits to buyers (RBAC 403)', async () => {
    await buyer(request(http).get('/api/v1/admin/inventory/proxies')).expect(403);
    await buyer(request(http).post('/api/v1/admin/inventory/proxies'))
      .send({ type: 'residential', geo: 'US', provider: 'p', credentials: 'h:1:u:p' })
      .expect(403);
  });

  it('imports proxies and binds a proxy + Octo profile to the job', async () => {
    // Bulk import via text/plain; then a single JSON create for the one we bind.
    const report = await admin(request(http).post('/api/v1/admin/inventory/proxies/import'))
      .set('Content-Type', 'text/plain')
      .send('residential,US,pool,extra.example:1:u:p\nresidential,US,pool,extra.example:1:u:p')
      .expect(201);
    expect(report.body).toEqual({ added: 1, skipped: 1 });

    const proxy = await admin(request(http).post('/api/v1/admin/inventory/proxies'))
      .send({
        type: 'residential',
        geo: 'US',
        provider: 'brightdata',
        credentials: 'gw.example.com:8000:usr:PXsecret',
      })
      .expect(201);
    // The operator view never leaks the credentials.
    expect(JSON.stringify(proxy.body)).not.toContain('PXsecret');

    await admin(request(http).post(`/api/v1/admin/inventory/proxies/${proxy.body.id}/bind`))
      .send({ jobId })
      .expect(200);

    const octo = await admin(request(http).post('/api/v1/admin/inventory/octo'))
      .send({
        name: 'Aurora-US-01',
        externalId: 'octo-777',
        exportRef: 'https://octo.example/share/xyz',
      })
      .expect(201);
    expect(JSON.stringify(octo.body)).not.toContain('octo.example');

    const bound = await admin(
      request(http).post(`/api/v1/admin/inventory/octo/${octo.body.id}/bind`),
    )
      .send({ jobId })
      .expect(200);
    expect(bound.body).toMatchObject({ status: 'ready', jobId, proxyItemId: proxy.body.id });

    // The job now reports both bound resources (no secrets).
    const jobInv = await admin(
      request(http).get(`/api/v1/admin/warming/jobs/${jobId}/inventory`),
    ).expect(200);
    expect(jobInv.body.proxy.id).toBe(proxy.body.id);
    expect(jobInv.body.octo.id).toBe(octo.body.id);
  });

  it('delivers the bundle and lands the real proxy + Octo data in the buyer Vault', async () => {
    const delivered = await admin(
      request(http).post(`/api/v1/admin/warming/jobs/${jobId}/transition`),
    )
      .send({ action: 'deliver' })
      .expect(200);
    expect(delivered.body.status).toBe('delivered');

    const order = await buyer(request(http).get(`/api/v1/orders/${orderId}`)).expect(200);
    expect(order.body.status).toBe('delivered');

    const delivery = await buyer(
      request(http).get(`/api/v1/orders/${orderId}/items/${orderItemId}/delivery`),
    ).expect(200);
    expect(delivery.body.type).toBe('warm');
    expect(delivery.body.payload).toContain('gw.example.com:8000:usr:PXsecret');
    expect(delivery.body.payload).toContain('https://octo.example/share/xyz');
    expect(delivery.body.payload).toContain('kit@ex.io');

    // The Octo profile is delivered; the proxy stays assigned to its owner.
    const octoRow = prisma.octoProfile.rows.find((r) => r.jobId === jobId)!;
    expect(octoRow.status).toBe('delivered');
    const proxyRow = prisma.proxyItem.rows.find((r) => r.assignedJobId === jobId)!;
    expect(proxyRow.status).toBe('assigned');
  });
});
