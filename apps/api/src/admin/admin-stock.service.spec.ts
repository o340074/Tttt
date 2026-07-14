import { describe, expect, it } from 'vitest';
import { AdminStockService } from './admin-stock.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * AdminStockService aggregates the READY_STOCK pool per variant by status.
 * A tiny hand-rolled Prisma stub keeps the test focused on the grouping and
 * the localized name — no payloads are ever touched.
 */
function makeStub(): PrismaService {
  const variant = {
    id: 'v1',
    productId: 'p1',
    sku: 'GADS-STARTER',
    fulfillmentType: 'READY_STOCK' as const,
    product: {
      slug: 'google-ads-starter',
      translations: [
        { locale: 'en', name: 'Google Ads' },
        { locale: 'ru', name: 'Гугл Реклама' },
      ],
    },
    // variantName reads attributes.name_<locale>; fall back to sku otherwise.
    attributes: { name_en: 'Starter', name_ru: 'Стартовый' },
    tier: 'starter',
  };
  return {
    productVariant: {
      findMany: () => Promise.resolve([variant]),
    },
    stockItem: {
      groupBy: () =>
        Promise.resolve([
          { variantId: 'v1', status: 'available', _count: { _all: 7 } },
          { variantId: 'v1', status: 'reserved', _count: { _all: 2 } },
          { variantId: 'v1', status: 'sold', _count: { _all: 5 } },
        ]),
    },
  } as unknown as PrismaService;
}

describe('AdminStockService', () => {
  it('aggregates pool counts per variant and totals them', async () => {
    const service = new AdminStockService(makeStub());
    const rows = await service.list('en');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      variantId: 'v1',
      productSlug: 'google-ads-starter',
      available: 7,
      reserved: 2,
      sold: 5,
      total: 14,
    });
  });

  it('localizes the row name (EN vs RU)', async () => {
    const service = new AdminStockService(makeStub());
    const en = await service.list('en');
    const ru = await service.list('ru');
    expect(en[0]!.name).toBe('Google Ads · Starter');
    expect(ru[0]!.name).toBe('Гугл Реклама · Стартовый');
  });

  it('reports zero counts for a variant with no stock rows', async () => {
    const stub = {
      productVariant: {
        findMany: () =>
          Promise.resolve([
            {
              id: 'v2',
              productId: 'p2',
              sku: 'EMPTY',
              product: { slug: 'empty', translations: [{ locale: 'en', name: 'Empty' }] },
              attributes: {},
              tier: null,
            },
          ]),
      },
      stockItem: { groupBy: () => Promise.resolve([]) },
    } as unknown as PrismaService;

    const rows = await new AdminStockService(stub).list('en');
    expect(rows[0]).toMatchObject({ available: 0, reserved: 0, sold: 0, total: 0 });
  });
});
