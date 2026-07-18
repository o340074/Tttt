import { Test } from '@nestjs/testing';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { makeFakePrismaService, makeFakeRedisService } from '../src/testing/fakes';
import type { INestApplication } from '@nestjs/common';

// Test env (incl. PAYMENT_WEBHOOK_SECRET) is set by vitest.config.ts before imports run.
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? '';

const sign = (raw: string): string =>
  createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');

/**
 * Smoke: top-up lifecycle over HTTP — create (Idempotency-Key) → poll →
 * signed webhook credits the ledger+balance exactly once → history shows it.
 */
describe('Wallet smoke (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const prisma = makeFakePrismaService();

  let accessToken = '';
  let topUpId = '';
  let externalId = '';
  const idempotencyKey = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(makeFakeRedisService())
      .compile();
    // rawBody mirrors main.ts — webhook signatures verify the exact bytes.
    app = configureApp(moduleRef.createNestApplication({ rawBody: true }));
    await app.init();
    http = app.getHttpServer();

    const res = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: 'wallet-smoke@advault.dev', password: 'password-123' })
      .expect(201);
    accessToken = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const postWebhook = (payload: unknown, signature?: string): request.Test => {
    const raw = JSON.stringify(payload);
    return request(http)
      .post('/api/v1/webhooks/payments/sandbox')
      .set('Content-Type', 'application/json')
      .set('X-Signature', signature ?? sign(raw))
      .send(raw);
  };

  it('requires auth for wallet routes', async () => {
    await request(http).get('/api/v1/wallet').expect(401);
  });

  it('starts with a zero balance and empty history', async () => {
    const res = await request(http)
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toEqual({ balance: '0.00', currency: 'USD', recent: [] });
  });

  it('rejects a top-up without an Idempotency-Key', async () => {
    const res = await request(http)
      .post('/api/v1/wallet/topups')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: '100.00', asset: 'USDT-TRC20' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates a pending top-up with payment details', async () => {
    const res = await request(http)
      .post('/api/v1/wallet/topups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ amount: '100.00', asset: 'USDT-TRC20' })
      .expect(201);
    expect(res.body).toMatchObject({ status: 'pending', amount: '100.00', provider: 'sandbox' });
    expect(res.body.address).toBeTruthy();
    expect(res.body.expiresAt).toBeTruthy();
    topUpId = res.body.id;
    externalId = prisma.topUp.rows[0]!.externalId!;
  });

  it('replays the same top-up for a repeated Idempotency-Key (no duplicate)', async () => {
    const res = await request(http)
      .post('/api/v1/wallet/topups')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ amount: '100.00', asset: 'USDT-TRC20' })
      .expect(201);
    expect(res.body.id).toBe(topUpId);
    expect(prisma.topUp.rows).toHaveLength(1);
  });

  it('polls the pending top-up status', async () => {
    const res = await request(http)
      .get(`/api/v1/wallet/topups/${topUpId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.status).toBe('pending');
  });

  it('rejects a webhook with an invalid signature', async () => {
    const res = await postWebhook({ externalId, status: 'paid' }, 'f'.repeat(64)).expect(401);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('credits the balance via a signed webhook', async () => {
    await postWebhook({ externalId, status: 'paid', fee: '1.00' }).expect(200);

    const wallet = await request(http)
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(wallet.body.balance).toBe('100.00');
    expect(wallet.body.recent).toHaveLength(1);
    expect(wallet.body.recent[0]).toMatchObject({
      direction: 'credit',
      amount: '100.00',
      balanceAfter: '100.00',
      refType: 'topup',
      refId: topUpId,
    });

    const status = await request(http)
      .get(`/api/v1/wallet/topups/${topUpId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(status.body.status).toBe('paid');
  });

  it('ignores a replayed webhook (idempotent, no double credit)', async () => {
    await postWebhook({ externalId, status: 'paid' }).expect(200);

    const wallet = await request(http)
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(wallet.body.balance).toBe('100.00');
    expect(prisma.ledgerEntry.rows).toHaveLength(1);
  });

  it('lists the credit in the transaction history with pagination meta', async () => {
    const res = await request(http)
      .get('/api/v1/wallet/transactions?page=1&limit=10')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 10 });
    expect(res.body.data[0]).toMatchObject({ amount: '100.00', refType: 'topup' });
  });
});
