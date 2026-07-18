import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { makeFakePrismaService, makeFakeRedisService } from '../src/testing/fakes';
import type { INestApplication } from '@nestjs/common';

/**
 * Smoke: the E8 catalog & warming-plan admin surface over HTTP. RBAC is the
 * point — catalog/plans are managers/admins only (buyers and support are locked
 * out) — plus the end-to-end "run the shop from the UI" flow: author a plan,
 * build a product → variant → bundle whose ETA is derived from the plan, publish
 * it, then version the plan and watch the linked variant's ETA follow.
 */
describe('Admin catalog/plans smoke (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const prisma = makeFakePrismaService();

  let buyerToken = '';
  let supportToken = '';
  let managerToken = '';

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

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

    buyerToken = await promote('buyer-cat@advault.test', 'user');
    supportToken = await promote('support-cat@advault.test', 'support');
    managerToken = await promote('manager-cat@advault.test', 'manager');
  });

  afterAll(async () => {
    await app.close();
  });

  it('locks catalog/plans to managers+ (buyer & support get 403)', async () => {
    await request(http).get('/api/v1/admin/products').set(auth(buyerToken)).expect(403);
    await request(http).get('/api/v1/admin/products').set(auth(supportToken)).expect(403);
    await request(http)
      .post('/api/v1/admin/warming-plans')
      .set(auth(buyerToken))
      .send({ goal: 'x', name: 'x', stages: [{ name: 's', expectedMinutes: 10 }] })
      .expect(403);
  });

  it('runs the full shop-from-UI flow as a manager', async () => {
    // 1) A warming plan (ETA = 60 + 120 = 180).
    const plan = await request(http)
      .post('/api/v1/admin/warming-plans')
      .set(auth(managerToken))
      .send({
        goal: 'google_ads',
        tier: 'warm_7d',
        name: 'Google Ads · 7d',
        stages: [
          { name: 'Setup', expectedMinutes: 60, requiredComponents: ['ACCOUNT'] },
          { name: 'Warm-up', expectedMinutes: 120, requiredComponents: ['PROXY'] },
        ],
      })
      .expect(201);
    expect(plan.body.version).toBe(1);
    expect(plan.body.etaMinutes).toBe(180);
    const planId = plan.body.id as string;

    // 2) A category.
    const category = await request(http)
      .post('/api/v1/admin/categories')
      .set(auth(managerToken))
      .send({
        slug: 'google-ads',
        translations: [
          { locale: 'en', name: 'Google Ads' },
          { locale: 'ru', name: 'Google Ads' },
        ],
      })
      .expect(201);
    const categoryId = category.body.id as string;

    // 3) A draft product.
    const product = await request(http)
      .post('/api/v1/admin/products')
      .set(auth(managerToken))
      .send({
        categoryId,
        slug: 'aged-google-ads',
        translations: [
          { locale: 'en', name: 'Aged Google Ads account', description: 'Warmed to order' },
          { locale: 'ru', name: 'Аккаунт Google Ads' },
        ],
      })
      .expect(201);
    expect(product.body.status).toBe('draft');
    const productId = product.body.id as string;

    // 4) A MADE_TO_ORDER variant with a bundle; ETA derived from the plan.
    const variant = await request(http)
      .post(`/api/v1/admin/products/${productId}/variants`)
      .set(auth(managerToken))
      .send({
        sku: 'gads-warm-7d',
        price: '120.00',
        fulfillmentType: 'MADE_TO_ORDER',
        goal: 'google_ads',
        tier: 'warm_7d',
        warmingPlanId: planId,
        warrantyHours: 72,
        bundle: [
          { type: 'ACCOUNT' },
          { type: 'PROXY', meta: { proxyType: 'residential', geo: 'US' } },
          { type: 'GUIDE', meta: { locale: 'en' } },
        ],
        names: { en: 'Warm 7 days', ru: 'Прогрев 7 дней' },
      })
      .expect(201);
    expect(variant.body.deliveryType).toBe('manual');
    expect(variant.body.etaMinutes).toBe(180);
    expect(variant.body.bundle).toHaveLength(3);
    const variantId = variant.body.id as string;

    // 5) Publish.
    const published = await request(http)
      .patch(`/api/v1/admin/products/${productId}`)
      .set(auth(managerToken))
      .send({ status: 'published' })
      .expect(200);
    expect(published.body.status).toBe('published');

    // 6) Version the plan → new version, and the linked variant's ETA follows.
    const versioned = await request(http)
      .patch(`/api/v1/admin/warming-plans/${planId}`)
      .set(auth(managerToken))
      .send({
        stages: [
          { name: 'Setup', expectedMinutes: 30 },
          { name: 'Warm-up', expectedMinutes: 90 },
          { name: 'QC', expectedMinutes: 30 },
        ],
      })
      .expect(200);
    expect(versioned.body.version).toBe(2);
    expect(versioned.body.etaMinutes).toBe(150);

    const reloaded = await request(http)
      .get(`/api/v1/admin/products/${productId}`)
      .set(auth(managerToken))
      .expect(200);
    const updatedVariant = reloaded.body.variants.find((v: { id: string }) => v.id === variantId);
    expect(updatedVariant.etaMinutes).toBe(150);
  });

  it('rejects an invalid bundle component (bad proxyType)', async () => {
    const category = await request(http)
      .post('/api/v1/admin/categories')
      .set(auth(managerToken))
      .send({ slug: 'misc', translations: [{ locale: 'en', name: 'Misc' }] })
      .expect(201);
    const product = await request(http)
      .post('/api/v1/admin/products')
      .set(auth(managerToken))
      .send({
        categoryId: category.body.id,
        slug: 'misc-product',
        translations: [{ locale: 'en', name: 'Misc' }],
      })
      .expect(201);
    await request(http)
      .post(`/api/v1/admin/products/${product.body.id}/variants`)
      .set(auth(managerToken))
      .send({
        sku: 'misc-1',
        price: '5.00',
        fulfillmentType: 'READY_STOCK',
        bundle: [{ type: 'PROXY', meta: { proxyType: 'satellite' } }],
      })
      .expect(400);
  });
});
