import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import { pickTranslation } from './locale';
import type {
  BundleComponent,
  BundleComponentType,
  Category,
  FulfillmentType,
  Locale,
  Paginated,
  Product,
  ProductListItem,
  ProductVariant,
} from '@advault/types';
import type { ListProductsDto } from './dto/catalog.dto';
import type {
  Category as DbCategory,
  CategoryTranslation,
  Product as DbProduct,
  ProductTranslation,
  ProductVariant as DbVariant,
} from '@prisma/client';

type ProductWithRels = DbProduct & {
  translations: ProductTranslation[];
  category: DbCategory;
  variants: DbVariant[];
};

type DbCategoryWithTranslations = DbCategory & { translations: CategoryTranslation[] };

/** List item enriched with sort keys that never leave the service. */
interface EnrichedItem {
  item: ProductListItem;
  minPrice: Prisma.Decimal;
  createdAt: Date;
}

const BUNDLE_TYPES: BundleComponentType[] = [
  'ACCOUNT',
  'PROXY',
  'OCTO_PROFILE',
  'RECOVERY',
  'SECRETS',
  'GUIDE',
  'WARRANTY',
];

/** bundleSpec JSON → validated bundle components; unknown entries are dropped. */
export function parseBundleSpec(spec: unknown): BundleComponent[] {
  if (!Array.isArray(spec)) return [];
  const out: BundleComponent[] = [];
  for (const item of spec) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const { type, meta } = item as { type?: unknown; meta?: unknown };
      if (typeof type === 'string' && (BUNDLE_TYPES as string[]).includes(type)) {
        out.push({
          type: type as BundleComponentType,
          ...(meta && typeof meta === 'object' ? { meta: meta as Record<string, unknown> } : {}),
        });
      }
    }
  }
  return out;
}

/** Localized variant name: attributes.name_<locale> → name_en → tier → sku. */
function variantName(variant: DbVariant, locale: Locale): string {
  const attrs = (variant.attributes ?? {}) as Record<string, unknown>;
  const localized = attrs[`name_${locale}`] ?? attrs.name_en;
  if (typeof localized === 'string' && localized) return localized;
  return variant.tier ?? variant.sku;
}

function toVariantResponse(variant: DbVariant, locale: Locale): ProductVariant {
  return {
    id: variant.id,
    sku: variant.sku,
    name: variantName(variant, locale),
    price: variant.price.toFixed(2),
    currency: variant.currency,
    deliveryType: variant.deliveryType,
    fulfillmentType: variant.fulfillmentType,
    goal: variant.goal,
    tier: variant.tier,
    stockCount: variant.stockCount,
    etaMinutes: variant.etaMinutes,
    warrantyHours: variant.warrantyHours,
    bundle: parseBundleSpec(variant.bundleSpec),
    isActive: variant.isActive,
    attributes: (variant.attributes ?? {}) as Record<string, unknown>,
  };
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Localized category tree with published-product counts. */
  async getCategories(locale: Locale): Promise<Category[]> {
    const [categories, published] = await Promise.all([
      this.prisma.category.findMany({ include: { translations: true } }) as Promise<
        DbCategoryWithTranslations[]
      >,
      this.prisma.product.findMany({
        where: { status: 'published' },
        select: { categoryId: true },
      }),
    ]);

    const counts = new Map<string, number>();
    for (const { categoryId } of published) {
      counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
    }

    const nodes = new Map<string, Category>();
    for (const cat of categories) {
      nodes.set(cat.id, {
        id: cat.id,
        parentId: cat.parentId,
        slug: cat.slug,
        position: cat.position,
        name: pickTranslation(cat.translations, locale)?.name ?? cat.slug,
        productCount: counts.get(cat.id) ?? 0,
        children: [],
      });
    }

    const byPosition = (a: Category, b: Category) =>
      a.position - b.position || a.slug.localeCompare(b.slug);
    const roots: Category[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    for (const node of nodes.values()) node.children.sort(byPosition);
    return roots.sort(byPosition);
  }

  /**
   * Product list with filters/search/sort. Filtering happens in memory after a
   * bounded fetch of published products — fine for the MVP catalog size;
   * revisit with SQL-level filtering when the catalog grows.
   */
  async listProducts(query: ListProductsDto, locale: Locale): Promise<Paginated<ProductListItem>> {
    const categoryIds = await this.resolveCategoryFilter(query);
    if (categoryIds?.length === 0) {
      return { data: [], meta: { total: 0, page: query.page, limit: query.limit } };
    }

    const rows = (await this.prisma.product.findMany({
      where: {
        status: 'published',
        ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      },
      include: { translations: true, category: true, variants: true },
    })) as ProductWithRels[];

    const items = rows
      .map((row) => this.toListItem(row, locale, query))
      .filter((item): item is EnrichedItem => item !== null);

    this.sortItems(items, query.sort);

    const total = items.length;
    const start = (query.page - 1) * query.limit;
    const data = items.slice(start, start + query.limit).map((e) => e.item);
    return { data, meta: { total, page: query.page, limit: query.limit } };
  }

  /** Product card by slug with active variants (cheapest first). */
  async getProductBySlug(slug: string, locale: Locale): Promise<Product> {
    const row = (await this.prisma.product.findFirst({
      where: { slug, status: 'published' },
      include: { translations: true, category: true, variants: true },
    })) as ProductWithRels | null;
    if (!row) throw new ApiException('NOT_FOUND', 'Product not found', 404);

    const translation = pickTranslation(row.translations, locale);
    const variants = row.variants
      .filter((v) => v.isActive)
      .sort((a, b) => a.price.cmp(b.price))
      .map((v) => toVariantResponse(v, locale));

    return {
      id: row.id,
      categoryId: row.categoryId,
      categorySlug: row.category.slug,
      slug: row.slug,
      status: row.status,
      ratingAvg: row.ratingAvg?.toFixed(2) ?? null,
      name: translation?.name ?? row.slug,
      description: translation?.description ?? null,
      attributes: (row.attributes ?? {}) as Record<string, unknown>,
      variants,
    };
  }

  /** categoryId / category slug (with children) → category id set, or undefined if unfiltered. */
  private async resolveCategoryFilter(query: ListProductsDto): Promise<string[] | undefined> {
    if (query.categoryId) return [query.categoryId];
    if (!query.category) return undefined;
    const categories = await this.prisma.category.findMany({
      select: { id: true, parentId: true, slug: true },
    });
    const root = categories.find((c) => c.slug === query.category);
    if (!root) return [];
    const ids = [root.id];
    // Category tree is 1-2 levels deep (docs/05); one pass over direct children is enough.
    for (const cat of categories) if (cat.parentId === root.id) ids.push(cat.id);
    return ids;
  }

  /** Applies variant-level filters and search; null when the product drops out. */
  private toListItem(
    row: ProductWithRels,
    locale: Locale,
    query: ListProductsDto,
  ): EnrichedItem | null {
    let variants = row.variants.filter((v) => v.isActive);
    if (query.fulfillment) {
      variants = variants.filter((v) => v.fulfillmentType === query.fulfillment);
    }
    if (query.goal) variants = variants.filter((v) => v.goal === query.goal);
    if (query.minPrice) {
      const min = new Prisma.Decimal(query.minPrice);
      variants = variants.filter((v) => v.price.gte(min));
    }
    if (query.maxPrice) {
      const max = new Prisma.Decimal(query.maxPrice);
      variants = variants.filter((v) => v.price.lte(max));
    }
    if (query.inStock) {
      // Purchasable now: stock on hand, or made-to-order (always orderable).
      variants = variants.filter((v) => v.fulfillmentType === 'MADE_TO_ORDER' || v.stockCount > 0);
    }
    const [first] = variants;
    if (!first) return null;

    const translation = pickTranslation(row.translations, locale);
    const name = translation?.name ?? row.slug;
    if (query.q) {
      const needle = query.q.toLowerCase();
      const haystack = `${name} ${translation?.description ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return null;
    }

    const minPrice = variants.reduce((m, v) => (v.price.lt(m) ? v.price : m), first.price);
    const fulfillmentTypes = [...new Set(variants.map((v) => v.fulfillmentType))];
    const stockCount = variants
      .filter((v) => v.fulfillmentType === 'READY_STOCK')
      .reduce((sum, v) => sum + v.stockCount, 0);
    const etas = variants
      .filter((v) => v.fulfillmentType === 'MADE_TO_ORDER' && v.etaMinutes !== null)
      .map((v) => v.etaMinutes as number);

    return {
      item: {
        id: row.id,
        slug: row.slug,
        categoryId: row.categoryId,
        categorySlug: row.category.slug,
        name,
        ratingAvg: row.ratingAvg?.toFixed(2) ?? null,
        minPrice: minPrice.toFixed(2),
        currency: first.currency,
        fulfillmentTypes: fulfillmentTypes as FulfillmentType[],
        stockCount,
        etaMinutes: etas.length ? Math.min(...etas) : null,
        attributes: (row.attributes ?? {}) as Record<string, unknown>,
      },
      minPrice,
      createdAt: row.createdAt,
    };
  }

  private sortItems(items: EnrichedItem[], sort: ListProductsDto['sort']): void {
    switch (sort) {
      case 'price_asc':
        items.sort((a, b) => a.minPrice.cmp(b.minPrice));
        break;
      case 'price_desc':
        items.sort((a, b) => b.minPrice.cmp(a.minPrice));
        break;
      case 'rating':
        items.sort((a, b) => Number(b.item.ratingAvg ?? 0) - Number(a.item.ratingAvg ?? 0));
        break;
      case 'newest':
      default:
        items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
    }
  }
}
