import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
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

/** Smoke: public catalog over HTTP — categories → list (filters) → card, plus 404/validation. */
describe('Catalog smoke (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const prisma = makeFakePrismaService();

  beforeAll(async () => {
    const ads = makeCategoryRow({ slug: 'google-ads', position: 1 });
    ads.translations.push(
      { id: randomUUID(), categoryId: ads.id, locale: 'en', name: 'Google Ads' },
      { id: randomUUID(), categoryId: ads.id, locale: 'ru', name: 'Google Ads' },
    );
    prisma.category.rows.push(ads);

    const stock = makeProductRow({ slug: 'gads-us', category: ads, ratingAvg: '4.90' });
    stock.translations.push(
      {
        id: randomUUID(),
        productId: stock.id,
        locale: 'en',
        name: 'Google Ads — US Verified',
        description: 'Verified US account',
      },
      {
        id: randomUUID(),
        productId: stock.id,
        locale: 'ru',
        name: 'Google Ads — US верифицированный',
        description: 'Верифицированный аккаунт',
      },
    );
    stock.variants.push(
      makeVariantRow({
        sku: 'GADS-US-STD',
        price: '42.00',
        productId: stock.id,
        stockCount: 37,
        warrantyHours: 48,
        attributes: { name_en: 'Standard', name_ru: 'Стандарт' },
        bundleSpec: [{ type: 'ACCOUNT' }, { type: 'WARRANTY', meta: { hours: 48 } }],
      }),
    );

    const warm = makeProductRow({ slug: 'gads-warm', category: ads });
    warm.translations.push({
      id: randomUUID(),
      productId: warm.id,
      locale: 'en',
      name: 'Google Ads — warmed to order',
      description: 'Operator warm-up',
    });
    warm.variants.push(
      makeVariantRow({
        sku: 'GADS-WARM-7D',
        price: '180.00',
        productId: warm.id,
        fulfillmentType: 'MADE_TO_ORDER',
        goal: 'google_ads',
        tier: 'warm_7d',
        etaMinutes: 10080,
        warrantyHours: 72,
        bundleSpec: [{ type: 'ACCOUNT' }, { type: 'PROXY', meta: { geo: 'US' } }],
      }),
    );
    prisma.product.rows.push(stock, warm);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(makeFakeRedisService())
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the localized category tree without auth', async () => {
    const res = await request(http)
      .get('/api/v1/categories')
      .set('Accept-Language', 'ru')
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ slug: 'google-ads', name: 'Google Ads', productCount: 2 });
  });

  it('lists products with pagination meta', async () => {
    const res = await request(http).get('/api/v1/products').expect(200);
    expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 20 });
    expect(res.body.data.map((p: { slug: string }) => p.slug).sort()).toEqual([
      'gads-us',
      'gads-warm',
    ]);
  });

  it('filters by fulfillment and localizes via ?locale=', async () => {
    const res = await request(http)
      .get('/api/v1/products?fulfillment=READY_STOCK&locale=ru')
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      slug: 'gads-us',
      name: 'Google Ads — US верифицированный',
      minPrice: '42.00',
      stockCount: 37,
    });
  });

  it('serves the product card with variants, ETA and bundle', async () => {
    const res = await request(http).get('/api/v1/products/gads-warm').expect(200);
    expect(res.body.name).toBe('Google Ads — warmed to order');
    expect(res.body.variants).toHaveLength(1);
    expect(res.body.variants[0]).toMatchObject({
      sku: 'GADS-WARM-7D',
      price: '180.00',
      fulfillmentType: 'MADE_TO_ORDER',
      goal: 'google_ads',
      tier: 'warm_7d',
      etaMinutes: 10080,
      warrantyHours: 72,
      bundle: [{ type: 'ACCOUNT' }, { type: 'PROXY', meta: { geo: 'US' } }],
    });
  });

  it('404s with the Error envelope for unknown slugs', async () => {
    const res = await request(http).get('/api/v1/products/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects invalid query params with VALIDATION_ERROR', async () => {
    const res = await request(http).get('/api/v1/products?sort=bogus&page=0').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields).toHaveProperty('sort');
    expect(res.body.error.details.fields).toHaveProperty('page');
  });
});
