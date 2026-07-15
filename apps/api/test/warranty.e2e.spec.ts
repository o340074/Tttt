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
 * Warranty claims (E10): a buyer opens a replace/refund claim on a delivered
 * line inside its warranty window; staff triage and fulfill. Replace issues a
 * fresh asset (new Delivery, line `replaced`); refund credits the ledger and
 * flips the line/order `refunded`. Scoping and RBAC are enforced throughout.
 */
describe('Warranty claims (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const prisma = makeFakePrismaService();

  let buyerToken = '';
  let strangerToken = '';
  let supportToken = '';
  let adminToken = '';
  let variant: DbVariant;
  let buyerId = '';

  const seedStock = (variantId: string, line: string): void => {
    const crypto = app.get(PayloadCryptoService);
    prisma.stockItem.rows.push({
      id: randomUUID(),
      variantId,
      payload: crypto.encrypt(line),
      payloadHash: crypto.hash(line),
      status: 'available',
      reservedUntil: null,
      orderItemId: null,
      createdAt: new Date(),
    });
  };

  const authed = (req: request.Test, token: string): request.Test =>
    req.set('Authorization', `Bearer ${token}`);

  const topUpAndCheckout = async (token: string): Promise<{ orderId: string; itemId: string }> => {
    await authed(request(http).post('/api/v1/wallet/topups'), token)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '100.00', asset: 'USDT-TRC20' })
      .expect(201);
    const externalId = prisma.topUp.rows.at(-1)!.externalId!;
    const raw = JSON.stringify({ externalId, status: 'paid' });
    await request(http)
      .post('/api/v1/webhooks/payments/sandbox')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sign(raw))
      .send(raw)
      .expect(200);
    await authed(request(http).post('/api/v1/cart/items'), token)
      .send({ variantId: variant.id, quantity: 1 })
      .expect(201);
    const res = await authed(request(http).post('/api/v1/orders/checkout'), token)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(res.body.status).toBe('delivered');
    return { orderId: res.body.id, itemId: res.body.items[0].id };
  };

  // Register returns an access token directly — use it to stay under the
  // login throttle (5/min). Only the promoted roles need a fresh login.
  const registerToken = async (email: string): Promise<string> => {
    const res = await request(http)
      .post('/api/v1/auth/register')
      .send({ email, password: 'password-123' })
      .expect(201);
    return res.body.accessToken as string;
  };
  const login = async (email: string): Promise<string> => {
    const res = await request(http)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password-123' })
      .expect(200);
    return res.body.accessToken as string;
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
    const product = makeProductRow({ slug: 'google-ads-us-verified', category });
    product.translations.push({
      id: randomUUID(),
      productId: product.id,
      locale: 'en',
      name: 'Google Ads — US Verified',
      description: null,
    });
    variant = makeVariantRow({
      sku: 'GADS-US-WARRANTY',
      price: '42.00',
      productId: product.id,
      stockCount: 10,
      warrantyHours: 72,
      attributes: { name_en: 'Standard', name_ru: 'Стандарт' },
    });
    product.variants.push(variant);
    prisma.product.rows.push(product);
    prisma.productVariant.rows.push(variant);
    // Enough units for every checkout across the suite plus the replacement
    // that is drawn from the same pool. `spare*` lines mark replacement units.
    for (let i = 0; i < 8; i += 1) seedStock(variant.id, `orig${i}@x.io:S${i}`);
    for (let i = 0; i < 4; i += 1) seedStock(variant.id, `spare${i}@x.io:R${i}`);

    buyerToken = await registerToken('warranty-buyer@advault.dev');
    buyerId = prisma.user.rows.find((u) => u.email === 'warranty-buyer@advault.dev')!.id;
    strangerToken = await registerToken('warranty-stranger@advault.dev');

    await registerToken('warranty-support@advault.dev');
    prisma.user.rows.find((u) => u.email === 'warranty-support@advault.dev')!.role = 'support';
    supportToken = await login('warranty-support@advault.dev');

    await registerToken('warranty-admin@advault.dev');
    prisma.user.rows.find((u) => u.email === 'warranty-admin@advault.dev')!.role = 'admin';
    adminToken = await login('warranty-admin@advault.dev');
  });

  afterAll(async () => {
    await app.close();
  });

  it('surfaces warranty eligibility on a freshly delivered line', async () => {
    const { orderId } = await topUpAndCheckout(buyerToken);
    const res = await authed(request(http).get(`/api/v1/orders/${orderId}`), buyerToken).expect(
      200,
    );
    expect(res.body.items[0].warranty).toMatchObject({ warrantyHours: 72, eligible: true });
    expect(res.body.items[0].warranty.expiresAt).toBeTruthy();
  });

  it('runs the full REPLACE flow: request → approve → fulfill issues a fresh asset', async () => {
    const { orderId, itemId } = await topUpAndCheckout(buyerToken);

    // Buyer opens a replace claim.
    const created = await authed(request(http).post('/api/v1/warranty-claims'), buyerToken)
      .send({ orderItemId: itemId, type: 'replace', reason: 'Account got suspended on day one' })
      .expect(201);
    expect(created.body).toMatchObject({ type: 'replace', status: 'requested', orderId });
    const claimId = created.body.id;

    // Scoping: a stranger cannot read it (404, existence not disclosed).
    await authed(request(http).get(`/api/v1/warranty-claims/${claimId}`), strangerToken).expect(
      404,
    );
    // Owner can.
    await authed(request(http).get(`/api/v1/warranty-claims/${claimId}`), buyerToken).expect(200);

    // A second claim while one is open is rejected.
    await authed(request(http).post('/api/v1/warranty-claims'), buyerToken)
      .send({ orderItemId: itemId, type: 'refund', reason: 'again' })
      .expect(409);

    // Support sees it in the admin queue and approves it.
    const queue = await authed(
      request(http).get('/api/v1/admin/warranty-claims?status=requested'),
      supportToken,
    ).expect(200);
    expect(queue.body.data.some((c: { id: string }) => c.id === claimId)).toBe(true);
    await authed(
      request(http).post(`/api/v1/admin/warranty-claims/${claimId}/approve`),
      supportToken,
    )
      .send({ note: 'Verified suspension' })
      .expect(200);

    // Support may NOT fulfill (money/asset step is FINANCE_STAFF).
    await authed(
      request(http).post(`/api/v1/admin/warranty-claims/${claimId}/fulfill`),
      supportToken,
    )
      .set('Idempotency-Key', randomUUID())
      .expect(403);

    // Admin fulfills: a new replacement delivery is issued, line becomes replaced.
    const idem = randomUUID();
    const fulfilled = await authed(
      request(http).post(`/api/v1/admin/warranty-claims/${claimId}/fulfill`),
      adminToken,
    )
      .set('Idempotency-Key', idem)
      .expect(200);
    expect(fulfilled.body).toMatchObject({ status: 'replaced', itemStatus: 'replaced' });
    expect(fulfilled.body.replacementDeliveryId).toBeTruthy();

    // Idempotent replay returns the same result.
    const replay = await authed(
      request(http).post(`/api/v1/admin/warranty-claims/${claimId}/fulfill`),
      adminToken,
    )
      .set('Idempotency-Key', idem)
      .expect(200);
    expect(replay.body.replacementDeliveryId).toBe(fulfilled.body.replacementDeliveryId);

    // The buyer's Vault now hands over the replacement payload (type replacement).
    const delivery = await authed(
      request(http).get(`/api/v1/orders/${orderId}/items/${itemId}/delivery`),
      buyerToken,
    ).expect(200);
    expect(delivery.body.payload).toMatch(/@x\.io/);
    expect(delivery.body.type).toBe('replacement');
  });

  it('runs the REFUND flow: fulfill credits the ledger and flips the order refunded', async () => {
    const { orderId, itemId } = await topUpAndCheckout(buyerToken);
    const before = (await authed(request(http).get('/api/v1/wallet'), buyerToken).expect(200)).body
      .balance;

    const created = await authed(request(http).post('/api/v1/warranty-claims'), buyerToken)
      .send({ orderItemId: itemId, type: 'refund', reason: 'Does not log in' })
      .expect(201);
    const claimId = created.body.id;

    await authed(request(http).post(`/api/v1/admin/warranty-claims/${claimId}/approve`), adminToken)
      .send({})
      .expect(200);
    const fulfilled = await authed(
      request(http).post(`/api/v1/admin/warranty-claims/${claimId}/fulfill`),
      adminToken,
    )
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    expect(fulfilled.body).toMatchObject({
      status: 'refunded',
      itemStatus: 'refunded',
      orderStatus: 'refunded',
    });
    expect(fulfilled.body.refundedAmount).toBe('42.00');

    // The buyer's balance grew by the line subtotal (ledger credit).
    const after = (await authed(request(http).get('/api/v1/wallet'), buyerToken).expect(200)).body
      .balance;
    expect(Number(after) - Number(before)).toBeCloseTo(42, 2);

    // The order now reflects the refund.
    const order = await authed(request(http).get(`/api/v1/orders/${orderId}`), buyerToken).expect(
      200,
    );
    expect(order.body.status).toBe('refunded');
    expect(order.body.items[0].deliveryStatus).toBe('refunded');
  });

  it('rejects a claim on a line whose warranty window has expired (409)', async () => {
    const { itemId } = await topUpAndCheckout(buyerToken);
    // Backdate the delivery beyond the 72h window.
    const item = prisma.orderItem.rows.find((i) => i.id === itemId)!;
    for (const d of prisma.delivery.rows.filter((x) => x.orderItemId === item.id)) {
      d.deliveredAt = new Date(Date.now() - 100 * 3_600_000);
      d.createdAt = d.deliveredAt;
    }
    const res = await authed(request(http).post('/api/v1/warranty-claims'), buyerToken)
      .send({ orderItemId: itemId, type: 'replace', reason: 'too late' })
      .expect(409);
    expect(res.body.error.message).toMatch(/window/i);
  });

  it('lets staff reject a claim, notifying the buyer', async () => {
    const { itemId } = await topUpAndCheckout(buyerToken);
    const created = await authed(request(http).post('/api/v1/warranty-claims'), buyerToken)
      .send({ orderItemId: itemId, type: 'refund', reason: 'changed my mind' })
      .expect(201);
    const claimId = created.body.id;
    const rejected = await authed(
      request(http).post(`/api/v1/admin/warranty-claims/${claimId}/reject`),
      supportToken,
    )
      .send({ note: 'Outside policy' })
      .expect(200);
    expect(rejected.body.status).toBe('rejected');

    const view = await authed(
      request(http).get(`/api/v1/warranty-claims/${claimId}`),
      buyerToken,
    ).expect(200);
    expect(view.body).toMatchObject({ status: 'rejected', resolutionNote: 'Outside policy' });

    // The buyer received an in-app notification of the rejection.
    const notes = prisma.notification.rows.filter(
      (n) => n.userId === buyerId && n.type === 'warranty_rejected',
    );
    expect(notes.length).toBeGreaterThan(0);
  });

  it('requires auth on the buyer portal and forbids the admin queue for customers', async () => {
    await request(http).get('/api/v1/warranty-claims').expect(401);
    await authed(request(http).get('/api/v1/admin/warranty-claims'), buyerToken).expect(403);
  });
});
