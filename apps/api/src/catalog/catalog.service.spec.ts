import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception';
import {
  makeCategoryRow,
  makeFakePrismaService,
  makeProductRow,
  makeVariantRow,
} from '../testing/fakes';
import { CatalogService, parseBundleSpec } from './catalog.service';
import { pickTranslation, resolveLocale } from './locale';
import type { FakePrismaStores } from '../testing/fakes';
import type { ListProductsDto } from './dto/catalog.dto';
import type { PrismaService } from '../prisma/prisma.service';

const query = (overrides: Partial<ListProductsDto> = {}): ListProductsDto =>
  ({ page: 1, limit: 20, ...overrides }) as ListProductsDto;

describe('resolveLocale', () => {
  it('prefers the explicit query param', () => {
    expect(resolveLocale('ru', 'en-US,en;q=0.9')).toBe('ru');
  });

  it('parses Accept-Language with regions and q-weights', () => {
    expect(resolveLocale(undefined, 'fr-FR,ru-RU;q=0.8,en;q=0.5')).toBe('ru');
  });

  it('falls back to EN for unsupported languages', () => {
    expect(resolveLocale(undefined, 'de-DE,fr;q=0.7')).toBe('en');
    expect(resolveLocale(undefined, undefined)).toBe('en');
  });
});

describe('pickTranslation', () => {
  const rows = [
    { locale: 'en', name: 'English' },
    { locale: 'ru', name: 'Русский' },
  ];

  it('picks the requested locale and falls back to EN', () => {
    expect(pickTranslation(rows, 'ru')?.name).toBe('Русский');
    expect(pickTranslation([rows[0]!], 'ru')?.name).toBe('English');
  });
});

describe('parseBundleSpec', () => {
  it('keeps valid components with meta and drops junk', () => {
    expect(
      parseBundleSpec([
        { type: 'ACCOUNT' },
        { type: 'PROXY', meta: { geo: 'US' } },
        { type: 'NOT_A_COMPONENT' },
        'garbage',
        null,
      ]),
    ).toEqual([{ type: 'ACCOUNT' }, { type: 'PROXY', meta: { geo: 'US' } }]);
  });

  it('returns [] for non-arrays', () => {
    expect(parseBundleSpec(null)).toEqual([]);
    expect(parseBundleSpec({ type: 'ACCOUNT' })).toEqual([]);
  });
});

describe('CatalogService', () => {
  let prisma: PrismaService & FakePrismaStores;
  let service: CatalogService;

  const catTr = (categoryId: string, locale: string, name: string) => ({
    id: randomUUID(),
    categoryId,
    locale,
    name,
  });
  const prodTr = (productId: string, locale: string, name: string, description?: string) => ({
    id: randomUUID(),
    productId,
    locale,
    name,
    description: description ?? null,
  });

  beforeEach(() => {
    prisma = makeFakePrismaService();
    service = new CatalogService(prisma);

    const ads = makeCategoryRow({ slug: 'google-ads', position: 1 });
    ads.translations.push(catTr(ads.id, 'en', 'Google Ads'), catTr(ads.id, 'ru', 'Google Ads RU'));
    const agency = makeCategoryRow({ slug: 'agency', position: 1, parentId: ads.id });
    agency.translations.push(catTr(agency.id, 'en', 'Agency accounts')); // no RU on purpose
    const proxies = makeCategoryRow({ slug: 'proxies', position: 2 });
    proxies.translations.push(
      catTr(proxies.id, 'en', 'Proxies'),
      catTr(proxies.id, 'ru', 'Прокси'),
    );
    prisma.category.rows.push(ads, agency, proxies);

    const stock = makeProductRow({
      slug: 'gads-us',
      category: ads,
      ratingAvg: '4.90',
      createdAt: new Date('2026-01-01'),
    });
    stock.translations.push(
      prodTr(stock.id, 'en', 'Google Ads — US Verified', 'Verified US account'),
      prodTr(stock.id, 'ru', 'Google Ads — US верифицированный', 'Верифицированный аккаунт'),
    );
    stock.variants.push(
      makeVariantRow({
        sku: 'GADS-US-STD',
        price: '42.00',
        productId: stock.id,
        stockCount: 37,
        warrantyHours: 48,
        attributes: { name_en: 'Standard', name_ru: 'Стандарт' },
      }),
      makeVariantRow({
        sku: 'GADS-US-AGED',
        price: '68.00',
        productId: stock.id,
        stockCount: 0,
      }),
    );

    const warm = makeProductRow({
      slug: 'gads-warm',
      category: ads,
      ratingAvg: '4.80',
      createdAt: new Date('2026-02-01'),
    });
    warm.translations.push(
      prodTr(warm.id, 'en', 'Google Ads — warmed to order', 'Operator warm-up'),
      prodTr(warm.id, 'ru', 'Google Ads — прогрев', 'Прогрев оператором'),
    );
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
        bundleSpec: [
          { type: 'ACCOUNT' },
          { type: 'PROXY', meta: { geo: 'US' } },
          { type: 'BOGUS' },
        ],
      }),
    );

    const agencyProduct = makeProductRow({
      slug: 'agency-eu',
      category: agency,
      createdAt: new Date('2026-03-01'),
    });
    agencyProduct.translations.push(prodTr(agencyProduct.id, 'en', 'Agency account — EU'));
    agencyProduct.variants.push(
      makeVariantRow({
        sku: 'AGENCY-EU',
        price: '240.00',
        productId: agencyProduct.id,
        fulfillmentType: 'MADE_TO_ORDER',
        goal: 'google_ads',
        etaMinutes: 4320,
      }),
    );

    const draft = makeProductRow({ slug: 'draft-product', category: proxies, status: 'draft' });
    draft.variants.push(makeVariantRow({ sku: 'DRAFT-1', price: '10.00', productId: draft.id }));

    prisma.product.rows.push(stock, warm, agencyProduct, draft);
  });

  describe('getCategories', () => {
    it('builds a localized tree with published-product counts', async () => {
      const tree = await service.getCategories('ru');
      expect(tree.map((c) => c.slug)).toEqual(['google-ads', 'proxies']);

      const ads = tree[0]!;
      expect(ads.name).toBe('Google Ads RU');
      expect(ads.productCount).toBe(2); // stock + warm; agency child counted separately
      expect(ads.children.map((c) => c.slug)).toEqual(['agency']);
      // RU missing on the child — falls back to EN.
      expect(ads.children[0]!.name).toBe('Agency accounts');
      expect(ads.children[0]!.productCount).toBe(1);

      // Draft products are not counted.
      expect(tree[1]!.productCount).toBe(0);
    });
  });

  describe('listProducts', () => {
    it('lists only published products with aggregates', async () => {
      const { data, meta } = await service.listProducts(query(), 'en');
      expect(meta.total).toBe(3);
      expect(data.map((p) => p.slug)).not.toContain('draft-product');

      const stock = data.find((p) => p.slug === 'gads-us')!;
      expect(stock.minPrice).toBe('42.00');
      expect(stock.stockCount).toBe(37);
      expect(stock.fulfillmentTypes).toEqual(['READY_STOCK']);
      expect(stock.etaMinutes).toBeNull();
    });

    it('sorts newest first by default', async () => {
      const { data } = await service.listProducts(query(), 'en');
      expect(data.map((p) => p.slug)).toEqual(['agency-eu', 'gads-warm', 'gads-us']);
    });

    it('filters by fulfillment and exposes the minimal ETA', async () => {
      const { data } = await service.listProducts(query({ fulfillment: 'MADE_TO_ORDER' }), 'en');
      expect(data.map((p) => p.slug).sort()).toEqual(['agency-eu', 'gads-warm']);
      expect(data.find((p) => p.slug === 'gads-warm')?.etaMinutes).toBe(10080);
    });

    it('filters by goal and price range', async () => {
      const byGoal = await service.listProducts(query({ goal: 'google_ads' }), 'en');
      expect(byGoal.meta.total).toBe(2);

      const byPrice = await service.listProducts(
        query({ minPrice: '100.00', maxPrice: '200.00' }),
        'en',
      );
      expect(byPrice.data.map((p) => p.slug)).toEqual(['gads-warm']);
    });

    it('filters by category slug including children', async () => {
      const { data } = await service.listProducts(query({ category: 'google-ads' }), 'en');
      expect(data.map((p) => p.slug).sort()).toEqual(['agency-eu', 'gads-us', 'gads-warm']);

      const unknown = await service.listProducts(query({ category: 'nope' }), 'en');
      expect(unknown.meta.total).toBe(0);
    });

    it('searches the localized name/description', async () => {
      const ru = await service.listProducts(query({ q: 'прогрев' }), 'ru');
      expect(ru.data.map((p) => p.slug)).toEqual(['gads-warm']);

      const en = await service.listProducts(query({ q: 'verified' }), 'en');
      expect(en.data.map((p) => p.slug)).toEqual(['gads-us']);
    });

    it('inStock keeps made-to-order and stocked variants only', async () => {
      const { data } = await service.listProducts(
        query({ inStock: true, sort: 'price_asc' }),
        'en',
      );
      expect(data.map((p) => p.slug)).toEqual(['gads-us', 'gads-warm', 'agency-eu']);
    });

    it('paginates with a stable total', async () => {
      const page2 = await service.listProducts(query({ page: 2, limit: 2 }), 'en');
      expect(page2.meta).toEqual({ total: 3, page: 2, limit: 2 });
      expect(page2.data).toHaveLength(1);
    });
  });

  describe('getProductBySlug', () => {
    it('returns a localized card with parsed bundle and ETA', async () => {
      const product = await service.getProductBySlug('gads-warm', 'ru');
      expect(product.name).toBe('Google Ads — прогрев');
      expect(product.categorySlug).toBe('google-ads');

      const variant = product.variants[0]!;
      expect(variant.price).toBe('180.00');
      expect(variant.fulfillmentType).toBe('MADE_TO_ORDER');
      expect(variant.deliveryType).toBe('manual');
      expect(variant.etaMinutes).toBe(10080);
      expect(variant.warrantyHours).toBe(72);
      // Unknown bundle entries are dropped, valid ones survive.
      expect(variant.bundle).toEqual([{ type: 'ACCOUNT' }, { type: 'PROXY', meta: { geo: 'US' } }]);
    });

    it('localizes variant names with fallbacks (name_ru → name_en → tier → sku)', async () => {
      const ru = await service.getProductBySlug('gads-us', 'ru');
      expect(ru.variants.map((v) => v.name)).toEqual(['Стандарт', 'GADS-US-AGED']);

      const warm = await service.getProductBySlug('gads-warm', 'en');
      expect(warm.variants[0]!.name).toBe('warm_7d'); // no name_* attributes → tier
    });

    it('sorts variants cheapest first', async () => {
      const product = await service.getProductBySlug('gads-us', 'en');
      expect(product.variants.map((v) => v.price)).toEqual(['42.00', '68.00']);
    });

    it('404s for missing and unpublished products', async () => {
      await expect(service.getProductBySlug('nope', 'en')).rejects.toThrowError(ApiException);
      await expect(service.getProductBySlug('draft-product', 'en')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
