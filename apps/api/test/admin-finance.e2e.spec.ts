import { Test } from '@nestjs/testing';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PayloadCryptoService } from '../src/crypto/payload-crypto.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import {
  makeCategoryRow,
  makeFakePrismaService,
  makeFakeRedisService,
  makeProductRow,
  makeVariantRow,
} from '../src/testing/fakes';
import type { INestApplication } from '@nestjs/common';
import type { ProductVariant as DbVariant } from '@prisma/client';

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? '';
const sign = (raw: string): string =>
  createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');

/**
 * Smoke: the E8 finance / users / promo admin surface over HTTP. RBAC is the
 * point — buyers are locked out everywhere; the finance actions (refund, promo)
 * are manager/admin only; a whole-order refund credits the buyer's ledger; and
 * the users/promo CRUD works end to end.
 */
describe('Admin finance/users/promo smoke (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const prisma = makeFakePrismaService();

  let buyerToken = '';
  let buyerId = '';
  let adminToken = '';
  let supportToken = '';
  let stockVariant: DbVariant;
  let orderId = '';

  const promote = async (email: string, role: string): Promise<string> => {
    await request(http)
      .post('/api/v1/auth/register')
      .send({ email, password: 'password-123' })
      .expect(201);
    const row = prisma.user.rows.find((u) => u.email === email)!;
    row.role = role as (typeof row)['role'];
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password-123' })
      .expect(200);
    return login.body.accessToken as string;
  };

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

    const category = makeCategoryRow({ slug: 'google-ads' });
    const product = makeProductRow({ slug: 'google-ads-fin', category });
    stockVariant = makeVariantRow({
      sku: 'GADS-FIN-STD',
      price: '42.00',
      productId: product.id,
      stockCount: 3,
      attributes: { name_en: 'Standard', name_ru: 'Стандарт' },
    });
    product.variants.push(stockVariant);
    prisma.product.rows.push(product);
    prisma.productVariant.rows.push(stockVariant);

    const crypto = app.get(PayloadCryptoService);
    for (const line of ['s1', 's2', 's3']) {
      prisma.stockItem.rows.push({
        id: randomUUID(),
        variantId: stockVariant.id,
        payload: crypto.encrypt(line),
        payloadHash: crypto.hash(line),
        status: 'available',
        reservedUntil: null,
        orderItemId: null,
        createdAt: new Date(),
      });
    }

    const buyer = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: 'fin-buyer@advault.dev', password: 'password-123' })
      .expect(201);
    buyerToken = buyer.body.accessToken;
    buyerId = prisma.user.rows.find((u) => u.email === 'fin-buyer@advault.dev')!.id;

    adminToken = await promote('fin-admin@advault.dev', 'admin');
    supportToken = await promote('fin-support@advault.dev', 'support');

    // Fund + buy the stock line so there is a paid order to refund.
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

    await request(http)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ variantId: stockVariant.id, quantity: 1 })
      .expect(201);
    const order = await request(http)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    orderId = order.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const buyer = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${buyerToken}`);
  const admin = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${adminToken}`);
  const support = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${supportToken}`);

  it('locks buyers out of the whole admin surface', async () => {
    await buyer(request(http).get('/api/v1/admin/users')).expect(403);
    await buyer(request(http).get('/api/v1/admin/finance/summary')).expect(403);
    await buyer(request(http).get('/api/v1/admin/promo-codes')).expect(403);
    await buyer(request(http).post(`/api/v1/admin/orders/${orderId}/refund`))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'nope' })
      .expect(403);
  });

  it('keeps refunds and promo CRUD to managers/admins (support is read-only on orders)', async () => {
    // Support can read users (ORDERS_STAFF) …
    await support(request(http).get('/api/v1/admin/users')).expect(200);
    // … but not touch finance (FINANCE_STAFF = manager/admin).
    await support(request(http).post(`/api/v1/admin/orders/${orderId}/refund`))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'nope' })
      .expect(403);
    await support(request(http).get('/api/v1/admin/finance/summary')).expect(403);
    await support(request(http).post('/api/v1/admin/promo-codes'))
      .send({ code: 'SUP', type: 'fixed', value: '5' })
      .expect(403);
  });

  it('lists users and blocks the buyer (admin)', async () => {
    const list = await admin(request(http).get('/api/v1/admin/users?q=fin-buyer')).expect(200);
    expect(list.body.data[0].email).toBe('fin-buyer@advault.dev');

    const blocked = await admin(request(http).post(`/api/v1/admin/users/${buyerId}/block`))
      .send({ reason: 'testing' })
      .expect(200);
    expect(blocked.body.status).toBe('blocked');
  });

  it('runs promo CRUD (admin)', async () => {
    const created = await admin(request(http).post('/api/v1/admin/promo-codes'))
      .send({ code: 'e2e10', type: 'percent', value: '10' })
      .expect(201);
    expect(created.body.code).toBe('E2E10');
    const list = await admin(request(http).get('/api/v1/admin/promo-codes')).expect(200);
    expect(list.body.some((p: { code: string }) => p.code === 'E2E10')).toBe(true);
    await admin(request(http).delete(`/api/v1/admin/promo-codes/${created.body.id}`)).expect(204);
  });

  it('refunds the whole order and credits the buyer ledger (admin, idempotent)', async () => {
    const key = randomUUID();
    const refund = await admin(request(http).post(`/api/v1/admin/orders/${orderId}/refund`))
      .set('Idempotency-Key', key)
      .send({ reason: 'goodwill' })
      .expect(200);
    expect(refund.body.status).toBe('refunded');
    expect(refund.body.amount).toBe('42.00');

    // Replay of the same key returns the same result (no double credit).
    const replay = await admin(request(http).post(`/api/v1/admin/orders/${orderId}/refund`))
      .set('Idempotency-Key', key)
      .send({ reason: 'goodwill' })
      .expect(200);
    expect(replay.body).toEqual(refund.body);

    // Ledger shows exactly one refund credit for this order's line.
    const refundCredits = prisma.ledgerEntry.rows.filter((r) => r.refType === 'refund');
    expect(refundCredits).toHaveLength(1);
  });
});
