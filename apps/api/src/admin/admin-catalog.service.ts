import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseBundleSpec } from '../catalog/catalog.service';
import {
  assertPublishable,
  computeEtaMinutes,
  deriveDeliveryType,
  normalizeBundleSpec,
  normalizeSku,
  normalizeSlug,
  normalizePositiveInt,
} from './catalog.logic';
import type {
  AdminCategory,
  AdminProductDetail,
  AdminProductListItem,
  AdminProductQuery,
  AdminVariant,
  CreateCategoryRequest,
  CreateProductRequest,
  CreateVariantRequest,
  FulfillmentType,
  Locale,
  ProductStatus,
  TranslationInput,
  UpdateCategoryRequest,
  UpdateProductRequest,
  UpdateVariantRequest,
} from '@advault/types';
import type {
  Category as DbCategory,
  CategoryTranslation as DbCategoryTranslation,
  Product as DbProduct,
  ProductTranslation as DbProductTranslation,
  ProductVariant as DbVariant,
} from '@prisma/client';

const LOCALES: Locale[] = ['en', 'ru'];

/**
 * Catalog administration (docs/13 §5): categories, products, variants (SKUs)
 * and the delivery-kit constructor. Editing a published entity is in-place —
 * OrderItem keeps a price/name/type snapshot (E4) so past orders are unaffected.
 * Removal is archiving (product → hidden, variant → inactive), never a hard
 * delete, to preserve order/stock references. Managers/admins only; audited.
 */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ================= Categories =================

  async listCategories(): Promise<AdminCategory[]> {
    const cats = (await this.prisma.category.findMany({
      orderBy: [{ position: 'asc' }, { slug: 'asc' }],
    })) as DbCategory[];
    return Promise.all(cats.map((c) => this.toCategory(c)));
  }

  async createCategory(actorId: string, body: CreateCategoryRequest): Promise<AdminCategory> {
    const slug = normalizeSlug(body.slug);
    const translations = this.normalizeTranslations(body.translations);
    if (body.parentId) await this.assertCategoryExists(body.parentId);

    const created = await this.prisma
      .$transaction(async (tx) => {
        const cat = await tx.category.create({
          data: { slug, parentId: body.parentId ?? null, position: body.position ?? 0 },
        });
        for (const t of translations) {
          await tx.categoryTranslation.create({
            data: { categoryId: cat.id, locale: t.locale, name: t.name },
          });
        }
        return cat;
      })
      .catch((error) => this.rethrowSlug(error, 'category'));

    await this.audit.record({
      actorId,
      action: 'category.create',
      entity: 'Category',
      entityId: created.id,
      diff: { slug, parentId: created.parentId },
    });
    return this.toCategory(created);
  }

  async updateCategory(
    actorId: string,
    id: string,
    body: UpdateCategoryRequest,
  ): Promise<AdminCategory> {
    const existing = (await this.prisma.category.findUnique({
      where: { id },
    })) as DbCategory | null;
    if (!existing) throw new ApiException('NOT_FOUND', 'Category not found', 404);
    if (body.parentId) {
      if (body.parentId === id)
        throw new ApiException('CONFLICT', 'A category cannot parent itself', 409);
      await this.assertCategoryExists(body.parentId);
    }

    const data: Prisma.CategoryUpdateInput = {};
    if (body.slug !== undefined) data.slug = normalizeSlug(body.slug);
    if (body.position !== undefined) data.position = body.position;

    const updated = await this.prisma
      .$transaction(async (tx) => {
        // parentId is a scalar FK; set via updateMany-style data to avoid relation typing.
        const cat = await tx.category.update({
          where: { id },
          data: {
            ...data,
            ...(body.parentId !== undefined ? { parentId: body.parentId ?? null } : {}),
          } as Prisma.CategoryUncheckedUpdateInput,
        });
        if (body.translations) {
          const translations = this.normalizeTranslations(body.translations);
          await tx.categoryTranslation.deleteMany({ where: { categoryId: id } });
          for (const t of translations) {
            await tx.categoryTranslation.create({
              data: { categoryId: id, locale: t.locale, name: t.name },
            });
          }
        }
        return cat;
      })
      .catch((error) => this.rethrowSlug(error, 'category'));

    await this.audit.record({
      actorId,
      action: 'category.update',
      entity: 'Category',
      entityId: id,
      diff: {
        ...(body.slug ? { slug: data.slug } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
      },
    });
    return this.toCategory(updated);
  }

  // ================= Products =================

  async listProducts(query: AdminProductQuery): Promise<AdminProductListItem[]> {
    const products = (await this.prisma.product.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: 'desc' },
    })) as DbProduct[];

    const rows = await Promise.all(products.map((p) => this.toListItem(p)));
    const q = query.q?.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.slug.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }

  async getProduct(id: string): Promise<AdminProductDetail> {
    const product = await this.loadProduct(id);
    return this.toProductDetail(product);
  }

  async createProduct(actorId: string, body: CreateProductRequest): Promise<AdminProductDetail> {
    const slug = normalizeSlug(body.slug);
    const translations = this.normalizeTranslations(body.translations);
    await this.assertCategoryExists(body.categoryId);

    const created = await this.prisma
      .$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            categoryId: body.categoryId,
            slug,
            status: 'draft',
            attributes: (body.attributes ?? {}) as Prisma.InputJsonValue,
          },
        });
        for (const t of translations) {
          await tx.productTranslation.create({
            data: {
              productId: product.id,
              locale: t.locale,
              name: t.name,
              description: t.description ?? null,
            },
          });
        }
        return product;
      })
      .catch((error) => this.rethrowSlug(error, 'product'));

    await this.audit.record({
      actorId,
      action: 'product.create',
      entity: 'Product',
      entityId: created.id,
      diff: { slug, categoryId: body.categoryId, status: 'draft' },
    });
    return this.getProduct(created.id);
  }

  async updateProduct(
    actorId: string,
    id: string,
    body: UpdateProductRequest,
  ): Promise<AdminProductDetail> {
    const product = await this.loadProduct(id);
    if (body.categoryId !== undefined) await this.assertCategoryExists(body.categoryId);

    // Publishing requires an active variant and an ETA on every made-to-order SKU.
    if (body.status === 'published' && product.status !== 'published') {
      assertPublishable(product.variants);
    }

    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (body.categoryId !== undefined) data.categoryId = body.categoryId;
    if (body.slug !== undefined) data.slug = normalizeSlug(body.slug);
    if (body.status !== undefined) data.status = body.status;
    if (body.attributes !== undefined) data.attributes = body.attributes as Prisma.InputJsonValue;

    await this.prisma
      .$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data });
        if (body.translations) {
          const translations = this.normalizeTranslations(body.translations);
          await tx.productTranslation.deleteMany({ where: { productId: id } });
          for (const t of translations) {
            await tx.productTranslation.create({
              data: {
                productId: id,
                locale: t.locale,
                name: t.name,
                description: t.description ?? null,
              },
            });
          }
        }
      })
      .catch((error) => this.rethrowSlug(error, 'product'));

    await this.audit.record({
      actorId,
      action:
        body.status && body.status !== product.status ? `product.${body.status}` : 'product.update',
      entity: 'Product',
      entityId: id,
      diff: {
        ...(body.slug ? { slug: data.slug } : {}),
        ...(body.categoryId ? { categoryId: body.categoryId } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });
    return this.getProduct(id);
  }

  // ================= Variants =================

  async createVariant(
    actorId: string,
    productId: string,
    body: CreateVariantRequest,
  ): Promise<AdminVariant> {
    await this.loadProduct(productId); // 404 if the product is gone
    const sku = normalizeSku(body.sku);
    const fulfillmentType = body.fulfillmentType;
    const price = this.parsePrice(body.price);
    const warmingPlanId = fulfillmentType === 'MADE_TO_ORDER' ? (body.warmingPlanId ?? null) : null;
    const etaMinutes = await this.resolveEta(fulfillmentType, warmingPlanId, body.etaMinutes);
    const bundleSpec = normalizeBundleSpec(body.bundle);
    const warrantyHours = normalizePositiveInt(body.warrantyHours, 'warrantyHours');

    let created: DbVariant;
    try {
      created = await this.prisma.productVariant.create({
        data: {
          productId,
          sku,
          price,
          currency: body.currency ?? 'USD',
          fulfillmentType,
          deliveryType: deriveDeliveryType(fulfillmentType),
          goal: this.normalizeOptional(body.goal),
          tier: this.normalizeOptional(body.tier),
          warmingPlanId,
          etaMinutes,
          warrantyHours,
          bundleSpec: bundleSpec as unknown as Prisma.InputJsonValue,
          isActive: body.isActive ?? true,
          attributes: this.mergeNames({}, body.names) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.rethrowSku(error);
    }

    await this.audit.record({
      actorId,
      action: 'variant.create',
      entity: 'ProductVariant',
      entityId: created.id,
      diff: { sku, productId, fulfillmentType, price: price.toFixed(2) },
    });
    return this.toAdminVariant(created);
  }

  async updateVariant(
    actorId: string,
    variantId: string,
    body: UpdateVariantRequest,
  ): Promise<AdminVariant> {
    const existing = (await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    })) as DbVariant | null;
    if (!existing) throw new ApiException('NOT_FOUND', 'Variant not found', 404);

    const fulfillmentType = body.fulfillmentType ?? (existing.fulfillmentType as FulfillmentType);
    const data: Prisma.ProductVariantUncheckedUpdateInput = {};
    if (body.sku !== undefined) data.sku = normalizeSku(body.sku);
    if (body.price !== undefined) data.price = this.parsePrice(body.price);
    if (body.currency !== undefined) data.currency = body.currency;
    if (body.goal !== undefined) data.goal = this.normalizeOptional(body.goal);
    if (body.tier !== undefined) data.tier = this.normalizeOptional(body.tier);
    if (body.warrantyHours !== undefined) {
      data.warrantyHours = normalizePositiveInt(body.warrantyHours, 'warrantyHours');
    }
    if (body.bundle !== undefined) {
      data.bundleSpec = normalizeBundleSpec(body.bundle) as unknown as Prisma.InputJsonValue;
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.names !== undefined) {
      data.attributes = this.mergeNames(
        (existing.attributes ?? {}) as Record<string, unknown>,
        body.names,
      ) as Prisma.InputJsonValue;
    }

    // Fulfillment/plan/eta are interdependent: recompute whenever any changes.
    const planTouched =
      body.fulfillmentType !== undefined ||
      body.warmingPlanId !== undefined ||
      body.etaMinutes !== undefined;
    if (planTouched) {
      const warmingPlanId =
        fulfillmentType === 'MADE_TO_ORDER'
          ? body.warmingPlanId !== undefined
            ? body.warmingPlanId
            : existing.warmingPlanId
          : null;
      data.fulfillmentType = fulfillmentType;
      data.deliveryType = deriveDeliveryType(fulfillmentType);
      data.warmingPlanId = warmingPlanId;
      data.etaMinutes = await this.resolveEta(
        fulfillmentType,
        warmingPlanId,
        body.etaMinutes !== undefined ? body.etaMinutes : existing.etaMinutes,
      );
    }

    let updated: DbVariant;
    try {
      updated = await this.prisma.productVariant.update({ where: { id: variantId }, data });
    } catch (error) {
      this.rethrowSku(error);
    }

    await this.audit.record({
      actorId,
      action: body.isActive === false ? 'variant.archive' : 'variant.update',
      entity: 'ProductVariant',
      entityId: variantId,
      diff: {
        ...(body.sku ? { sku: data.sku } : {}),
        ...(body.price !== undefined ? { price: this.parsePrice(body.price).toFixed(2) } : {}),
        ...(planTouched ? { fulfillmentType, etaMinutes: data.etaMinutes ?? null } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
    return this.toAdminVariant(updated);
  }

  // ================= Internals =================

  /** ETA from the linked plan's stages (MADE_TO_ORDER), else the manual value. */
  private async resolveEta(
    fulfillmentType: FulfillmentType,
    warmingPlanId: string | null,
    manual: number | null | undefined,
  ): Promise<number | null> {
    if (fulfillmentType !== 'MADE_TO_ORDER') return null;
    if (warmingPlanId) {
      const plan = await this.prisma.warmingPlan.findUnique({
        where: { id: warmingPlanId },
        include: { stages: true },
      });
      if (!plan) {
        throw new ApiException('VALIDATION_ERROR', 'Linked warming plan not found', 400, {
          fields: { warmingPlanId: ['unknown plan'] },
        });
      }
      return computeEtaMinutes((plan as { stages: { expectedMinutes: number }[] }).stages);
    }
    return normalizePositiveInt(manual ?? null, 'etaMinutes');
  }

  private parsePrice(raw: string): Prisma.Decimal {
    let value: Prisma.Decimal;
    try {
      value = new Prisma.Decimal(raw);
    } catch {
      throw new ApiException('VALIDATION_ERROR', 'Price must be a number', 400, {
        fields: { price: ['must be a number'] },
      });
    }
    if (value.lte(0)) {
      throw new ApiException('VALIDATION_ERROR', 'Price must be positive', 400, {
        fields: { price: ['must be positive'] },
      });
    }
    return value;
  }

  private normalizeOptional(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private mergeNames(
    attributes: Record<string, unknown>,
    names: Partial<Record<Locale, string>> | undefined,
  ): Record<string, unknown> {
    const out = { ...attributes };
    if (!names) return out;
    for (const locale of LOCALES) {
      const value = names[locale];
      if (value === undefined) continue;
      const trimmed = value.trim();
      if (trimmed.length > 0) out[`name_${locale}`] = trimmed;
      else delete out[`name_${locale}`];
    }
    return out;
  }

  private normalizeTranslations(translations: TranslationInput[]): TranslationInput[] {
    const byLocale = new Map<Locale, TranslationInput>();
    for (const t of translations) {
      byLocale.set(t.locale, {
        locale: t.locale,
        name: t.name.trim(),
        description: t.description?.trim() || null,
      });
    }
    if (!byLocale.has('en')) {
      throw new ApiException('VALIDATION_ERROR', 'An English (en) translation is required', 400, {
        fields: { translations: ['en translation required'] },
      });
    }
    return [...byLocale.values()];
  }

  private async assertCategoryExists(id: string): Promise<void> {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) {
      throw new ApiException('VALIDATION_ERROR', 'Category not found', 400, {
        fields: { categoryId: ['unknown category'] },
      });
    }
  }

  private rethrowSlug(error: unknown, entity: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiException('CONFLICT', `A ${entity} with this slug already exists`, 409);
    }
    throw error;
  }

  private rethrowSku(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiException('CONFLICT', 'A variant with this SKU already exists', 409);
    }
    throw error;
  }

  // ---------- Mapping ----------

  private async toCategory(cat: DbCategory): Promise<AdminCategory> {
    const [translations, productCount] = await Promise.all([
      this.prisma.categoryTranslation.findMany({ where: { categoryId: cat.id } }) as Promise<
        DbCategoryTranslation[]
      >,
      this.prisma.product.count({ where: { categoryId: cat.id } }),
    ]);
    const names: Record<Locale, string> = { en: cat.slug, ru: cat.slug };
    for (const t of translations) {
      if ((LOCALES as string[]).includes(t.locale)) names[t.locale as Locale] = t.name;
    }
    return {
      id: cat.id,
      parentId: cat.parentId,
      slug: cat.slug,
      position: cat.position,
      names,
      productCount,
    };
  }

  private async loadProduct(id: string): Promise<DbProduct & { variants: DbVariant[] }> {
    const product = (await this.prisma.product.findUnique({ where: { id } })) as DbProduct | null;
    if (!product) throw new ApiException('NOT_FOUND', 'Product not found', 404);
    const variants = (await this.prisma.productVariant.findMany({
      where: { productId: id },
    })) as DbVariant[];
    return { ...product, variants };
  }

  private async toListItem(product: DbProduct): Promise<AdminProductListItem> {
    const [translations, variants, category] = await Promise.all([
      this.prisma.productTranslation.findMany({ where: { productId: product.id } }) as Promise<
        DbProductTranslation[]
      >,
      this.prisma.productVariant.findMany({ where: { productId: product.id } }) as Promise<
        DbVariant[]
      >,
      this.prisma.category.findUnique({
        where: { id: product.categoryId },
      }) as Promise<DbCategory | null>,
    ]);
    const en = translations.find((t) => t.locale === 'en') ?? translations[0];
    return {
      id: product.id,
      slug: product.slug,
      status: product.status as ProductStatus,
      categoryId: product.categoryId,
      categorySlug: category?.slug ?? '',
      name: en?.name ?? product.slug,
      variantCount: variants.length,
      activeVariantCount: variants.filter((v) => v.isActive).length,
      createdAt: product.createdAt.toISOString(),
    };
  }

  private async toProductDetail(
    product: DbProduct & { variants: DbVariant[] },
  ): Promise<AdminProductDetail> {
    const [translations, category] = await Promise.all([
      this.prisma.productTranslation.findMany({ where: { productId: product.id } }) as Promise<
        DbProductTranslation[]
      >,
      this.prisma.category.findUnique({
        where: { id: product.categoryId },
      }) as Promise<DbCategory | null>,
    ]);
    return {
      id: product.id,
      slug: product.slug,
      status: product.status as ProductStatus,
      categoryId: product.categoryId,
      categorySlug: category?.slug ?? '',
      attributes: (product.attributes ?? {}) as Record<string, unknown>,
      translations: translations.map((t) => ({
        locale: t.locale as Locale,
        name: t.name,
        description: t.description,
      })),
      variants: product.variants
        .sort((a, b) => a.price.cmp(b.price))
        .map((v) => this.toAdminVariant(v)),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private toAdminVariant(v: DbVariant): AdminVariant {
    const attrs = (v.attributes ?? {}) as Record<string, unknown>;
    const names: Partial<Record<Locale, string>> = {};
    for (const locale of LOCALES) {
      const value = attrs[`name_${locale}`];
      if (typeof value === 'string' && value) names[locale] = value;
    }
    return {
      id: v.id,
      productId: v.productId,
      sku: v.sku,
      price: v.price.toFixed(2),
      currency: v.currency,
      fulfillmentType: v.fulfillmentType,
      deliveryType: v.deliveryType,
      goal: v.goal,
      tier: v.tier,
      warmingPlanId: v.warmingPlanId,
      etaMinutes: v.etaMinutes,
      warrantyHours: v.warrantyHours,
      bundle: parseBundleSpec(v.bundleSpec),
      stockCount: v.stockCount,
      isActive: v.isActive,
      names,
      attributes: attrs,
    };
  }
}
