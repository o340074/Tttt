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
} from '../src/testing/fakes';
import type { INestApplication } from '@nestjs/common';
import type { ProductVariant as DbVariant } from '@prisma/client';

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? '';
const sign = (raw: string): string =>
  createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');

/**
 * Smoke: the E4 money path over HTTP — top up via the E3 webhook → cart →
 * checkout debits the balance exactly once (order paid, stock down, ledger
 * consistent) → an idempotent replay changes nothing.
 */
describe('Cart & checkout smoke (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const prisma = makeFakePrismaService();

  let accessToken = '';
  let stockVariant: DbVariant;
  let warmVariant: DbVariant;
  let cartItemId = '';
  let orderId = '';
  let orderNumber = '';
  const checkoutKey = randomUUID();

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

    // --- Catalog fixture: one stock variant, one made-to-order variant ---
    const category = makeCategoryRow({ slug: 'google-ads' });
    const product = makeProductRow({ slug: 'google-ads-us-verified', category });
    product.translations.push(
      {
        id: randomUUID(),
        productId: product.id,
        locale: 'en',
        name: 'Google Ads — US Verified',
        description: null,
      },
      {
        id: randomUUID(),
        productId: product.id,
        locale: 'ru',
        name: 'Google Ads — верифицированный US',
        description: null,
      },
    );
    stockVariant = makeVariantRow({
      sku: 'GADS-US-STD',
      price: '42.00',
      productId: product.id,
      stockCount: 5,
      attributes: { name_en: 'Standard', name_ru: 'Стандарт' },
    });
    warmVariant = makeVariantRow({
      sku: 'GADS-WARM-7D',
      price: '180.00',
      productId: product.id,
      fulfillmentType: 'MADE_TO_ORDER',
      etaMinutes: 7 * 24 * 60,
      attributes: { name_en: 'Warm-up · 7 days', name_ru: 'Прогрев · 7 дней' },
    });
    product.variants.push(stockVariant, warmVariant);
    prisma.product.rows.push(product);
    prisma.productVariant.rows.push(stockVariant, warmVariant);
    await prisma.promoCode.create({
      data: { code: 'AURORA10', type: 'percent', value: '10.00', maxUses: 1000 },
    });

    const res = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: 'checkout-smoke@advault.dev', password: 'password-123' })
      .expect(201);
    accessToken = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${accessToken}`);

  it('requires auth for cart and orders routes', async () => {
    await request(http).get('/api/v1/cart').expect(401);
    await request(http).get('/api/v1/orders').expect(401);
  });

  it('tops up the balance via the E3 webhook flow', async () => {
    await authed(request(http).post('/api/v1/wallet/topups'))
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

    const wallet = await authed(request(http).get('/api/v1/wallet')).expect(200);
    expect(wallet.body.balance).toBe('100.00');
  });

  it('starts with an empty cart', async () => {
    const res = await authed(request(http).get('/api/v1/cart')).expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.subtotal).toBe('0.00');
  });

  it('adds a variant and merges a repeated add into one line', async () => {
    await authed(request(http).post('/api/v1/cart/items'))
      .send({ variantId: stockVariant.id, quantity: 1 })
      .expect(201);
    const res = await authed(request(http).post('/api/v1/cart/items'))
      .send({ variantId: stockVariant.id, quantity: 1 })
      .expect(201);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      sku: 'GADS-US-STD',
      name: 'Google Ads — US Verified · Standard',
      quantity: 2,
      unitPrice: '42.00',
      lineTotal: '84.00',
      fulfillmentType: 'READY_STOCK',
      stockCount: 5,
      isActive: true,
    });
    expect(res.body.subtotal).toBe('84.00');
    cartItemId = res.body.items[0].id;
  });

  it('rejects a quantity above the stock cache with OUT_OF_STOCK', async () => {
    const res = await authed(request(http).patch(`/api/v1/cart/items/${cartItemId}`))
      .send({ quantity: 6 })
      .expect(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');
    expect(res.body.error.details).toMatchObject({ available: 5 });
  });

  it('updates the quantity and localizes the cart (RU)', async () => {
    const res = await authed(request(http).patch(`/api/v1/cart/items/${cartItemId}?locale=ru`))
      .send({ quantity: 1 })
      .expect(200);
    expect(res.body.items[0]).toMatchObject({
      quantity: 1,
      name: 'Google Ads — верифицированный US · Стандарт',
    });
    expect(res.body.subtotal).toBe('42.00');
  });

  it('validates a promo code for the discount preview', async () => {
    const ok = await authed(request(http).get('/api/v1/promo-codes/aurora10')).expect(200);
    expect(ok.body).toEqual({ code: 'AURORA10', type: 'percent', value: '10.00' });

    const bad = await authed(request(http).get('/api/v1/promo-codes/NOPE')).expect(404);
    expect(bad.body.error.code).toBe('PROMO_INVALID');
  });

  it('requires an Idempotency-Key for checkout', async () => {
    const res = await authed(request(http).post('/api/v1/orders/checkout')).send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('checks out: paid order, balance debited once, stock down, cart cleared', async () => {
    const res = await authed(request(http).post('/api/v1/orders/checkout'))
      .set('Idempotency-Key', checkoutKey)
      .send({ promoCode: 'AURORA10' })
      .expect(201);

    expect(res.body).toMatchObject({
      status: 'paid',
      subtotal: '42.00',
      discount: '4.20',
      total: '37.80',
      promoCode: 'AURORA10',
    });
    expect(res.body.number).toMatch(/^AV-\d{4}-\d{6}$/);
    expect(res.body.items[0]).toMatchObject({
      sku: 'GADS-US-STD',
      quantity: 1,
      unitPrice: '42.00',
      deliveryType: 'auto',
      deliveryStatus: 'pending',
    });
    orderId = res.body.id;
    orderNumber = res.body.number;

    const wallet = await authed(request(http).get('/api/v1/wallet')).expect(200);
    expect(wallet.body.balance).toBe('62.20');
    expect(wallet.body.recent[0]).toMatchObject({
      direction: 'debit',
      amount: '37.80',
      balanceAfter: '62.20',
      refType: 'order',
      refId: orderId,
    });
    expect(stockVariant.stockCount).toBe(4);

    const cart = await authed(request(http).get('/api/v1/cart')).expect(200);
    expect(cart.body.items).toEqual([]);
  });

  it('replays the same checkout for a repeated Idempotency-Key (no double charge)', async () => {
    const res = await authed(request(http).post('/api/v1/orders/checkout'))
      .set('Idempotency-Key', checkoutKey)
      .send({ promoCode: 'AURORA10' })
      .expect(201);
    expect(res.body.id).toBe(orderId);
    expect(res.body.number).toBe(orderNumber);

    expect(prisma.order.rows).toHaveLength(1);
    expect(prisma.ledgerEntry.rows.filter((r) => r.direction === 'debit')).toHaveLength(1);
    const wallet = await authed(request(http).get('/api/v1/wallet')).expect(200);
    expect(wallet.body.balance).toBe('62.20');
    expect(stockVariant.stockCount).toBe(4);
  });

  it('refuses to pay beyond the balance with INSUFFICIENT_BALANCE and keeps the cart', async () => {
    await authed(request(http).post('/api/v1/cart/items'))
      .send({ variantId: warmVariant.id, quantity: 1 })
      .expect(201);

    const res = await authed(request(http).post('/api/v1/orders/checkout'))
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(res.body.error.details).toEqual({ required: '180.00', available: '62.20' });

    const wallet = await authed(request(http).get('/api/v1/wallet')).expect(200);
    expect(wallet.body.balance).toBe('62.20');
    const cart = await authed(request(http).get('/api/v1/cart')).expect(200);
    expect(cart.body.items).toHaveLength(1);
  });

  it('lists the order history and serves the localized detail', async () => {
    const list = await authed(request(http).get('/api/v1/orders?page=1&limit=10')).expect(200);
    expect(list.body.meta).toEqual({ total: 1, page: 1, limit: 10 });
    expect(list.body.data[0]).toMatchObject({ id: orderId, number: orderNumber, status: 'paid' });

    const detail = await authed(request(http).get(`/api/v1/orders/${orderId}?locale=ru`)).expect(
      200,
    );
    expect(detail.body.items[0].name).toBe('Google Ads — верифицированный US · Стандарт');
  });

  it('hides foreign orders (404 for another user)', async () => {
    const stranger = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: 'stranger-smoke@advault.dev', password: 'password-123' })
      .expect(201);
    await request(http)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${stranger.body.accessToken}`)
      .expect(404);
  });
});
