import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service';
import { makeFakePrismaService, makeWarmingPlanRow } from '../testing/fakes';
import { AdminCatalogService } from './admin-catalog.service';

/**
 * AdminCatalogService over the in-memory fakes: category/product/variant CRUD,
 * the bundle constructor, ETA derived from a linked plan, publish guards,
 * archiving (never hard delete) and audit on every mutation.
 */
describe('AdminCatalogService (E8 catalog & bundles CRUD)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let catalog: AdminCatalogService;
  const adminId = randomUUID();

  beforeEach(() => {
    prisma = makeFakePrismaService();
    catalog = new AdminCatalogService(prisma, new AuditService(prisma));
  });

  async function seedCategory(): Promise<string> {
    const cat = await catalog.createCategory(adminId, {
      slug: 'google-ads',
      translations: [
        { locale: 'en', name: 'Google Ads' },
        { locale: 'ru', name: 'Google Ads' },
      ],
    });
    return cat.id;
  }

  async function seedProduct(categoryId: string): Promise<string> {
    const product = await catalog.createProduct(adminId, {
      categoryId,
      slug: 'aged-google-ads',
      translations: [
        { locale: 'en', name: 'Aged Google Ads account', description: 'Warmed' },
        { locale: 'ru', name: 'Отлежавшийся аккаунт Google Ads' },
      ],
    });
    return product.id;
  }

  it('creates a category with EN/RU names (audited)', async () => {
    const cat = await catalog.createCategory(adminId, {
      slug: 'Proxies',
      translations: [
        { locale: 'en', name: 'Proxies' },
        { locale: 'ru', name: 'Прокси' },
      ],
    });
    expect(cat.slug).toBe('proxies');
    expect(cat.names).toEqual({ en: 'Proxies', ru: 'Прокси' });
    expect(cat.productCount).toBe(0);
    expect(prisma.auditLog.rows.some((a) => a.action === 'category.create')).toBe(true);
  });

  it('requires an English translation', async () => {
    await expect(
      catalog.createCategory(adminId, {
        slug: 'ru-only',
        translations: [{ locale: 'ru', name: 'Только русский' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('creates a draft product, then a READY_STOCK variant with a bundle, then publishes', async () => {
    const categoryId = await seedCategory();
    const productId = await seedProduct(categoryId);

    let detail = await catalog.getProduct(productId);
    expect(detail.status).toBe('draft');
    expect(detail.translations).toHaveLength(2);

    const variant = await catalog.createVariant(adminId, productId, {
      sku: 'av-ready-1',
      price: '48.00',
      fulfillmentType: 'READY_STOCK',
      bundle: [{ type: 'ACCOUNT' }, { type: 'GUIDE', meta: { locale: 'en' } }],
      names: { en: 'Standard', ru: 'Стандарт' },
    });
    expect(variant.sku).toBe('AV-READY-1');
    expect(variant.deliveryType).toBe('auto');
    expect(variant.etaMinutes).toBeNull();
    expect(variant.bundle).toHaveLength(2);
    expect(variant.names).toEqual({ en: 'Standard', ru: 'Стандарт' });

    const published = await catalog.updateProduct(adminId, productId, { status: 'published' });
    expect(published.status).toBe('published');
    expect(prisma.auditLog.rows.some((a) => a.action === 'product.published')).toBe(true);

    detail = await catalog.getProduct(productId);
    expect(detail.variants).toHaveLength(1);
  });

  it('derives a MADE_TO_ORDER variant ETA from its linked warming plan', async () => {
    const categoryId = await seedCategory();
    const productId = await seedProduct(categoryId);

    const plan = makeWarmingPlanRow({
      goal: 'google_ads',
      tier: 'warm_7d',
      stages: [
        { name: 'Setup', expectedMinutes: 120 },
        { name: 'Warm', expectedMinutes: 360 },
      ],
    });
    prisma.warmingPlan.rows.push(plan);

    const variant = await catalog.createVariant(adminId, productId, {
      sku: 'av-warm-1',
      price: '120.00',
      fulfillmentType: 'MADE_TO_ORDER',
      goal: 'google_ads',
      tier: 'warm_7d',
      warmingPlanId: plan.id,
      bundle: [
        { type: 'ACCOUNT' },
        { type: 'PROXY', meta: { proxyType: 'residential', geo: 'US' } },
      ],
    });
    expect(variant.deliveryType).toBe('manual');
    expect(variant.warmingPlanId).toBe(plan.id);
    expect(variant.etaMinutes).toBe(480);
  });

  it('rejects a variant linked to an unknown plan', async () => {
    const categoryId = await seedCategory();
    const productId = await seedProduct(categoryId);
    await expect(
      catalog.createVariant(adminId, productId, {
        sku: 'av-warm-x',
        price: '10.00',
        fulfillmentType: 'MADE_TO_ORDER',
        warmingPlanId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('archives a variant (isActive:false) instead of deleting it', async () => {
    const categoryId = await seedCategory();
    const productId = await seedProduct(categoryId);
    const variant = await catalog.createVariant(adminId, productId, {
      sku: 'av-arch-1',
      price: '10.00',
      fulfillmentType: 'READY_STOCK',
    });
    const archived = await catalog.updateVariant(adminId, variant.id, { isActive: false });
    expect(archived.isActive).toBe(false);
    expect(prisma.auditLog.rows.some((a) => a.action === 'variant.archive')).toBe(true);
    // Still present (archived, not removed).
    const detail = await catalog.getProduct(productId);
    expect(detail.variants).toHaveLength(1);
  });

  it('409s on a duplicate product slug and a duplicate SKU', async () => {
    const categoryId = await seedCategory();
    await seedProduct(categoryId);
    await expect(
      catalog.createProduct(adminId, {
        categoryId,
        slug: 'aged-google-ads',
        translations: [{ locale: 'en', name: 'Dup' }],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const productId = (await catalog.listProducts({})).find(
      (p) => p.slug === 'aged-google-ads',
    )!.id;
    await catalog.createVariant(adminId, productId, {
      sku: 'av-dup',
      price: '5.00',
      fulfillmentType: 'READY_STOCK',
    });
    await expect(
      catalog.createVariant(adminId, productId, {
        sku: 'av-dup',
        price: '6.00',
        fulfillmentType: 'READY_STOCK',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses to publish a product with no active variants', async () => {
    const categoryId = await seedCategory();
    const productId = await seedProduct(categoryId);
    await expect(
      catalog.updateProduct(adminId, productId, { status: 'published' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a product in an unknown category', async () => {
    await expect(
      catalog.createProduct(adminId, {
        categoryId: randomUUID(),
        slug: 'orphan',
        translations: [{ locale: 'en', name: 'Orphan' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('filters the product list by q', async () => {
    const categoryId = await seedCategory();
    await seedProduct(categoryId);
    expect(await catalog.listProducts({ q: 'aged' })).toHaveLength(1);
    expect(await catalog.listProducts({ q: 'nonexistent' })).toHaveLength(0);
  });
});
