import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { ProductCard } from '../features/catalog/ProductCard';
import { useCategories, useProducts } from '../features/catalog/api';
import type { Category, FulfillmentType, ProductSort } from '@advault/types';

const PAGE_SIZE = 12;
const FULFILLMENTS: FulfillmentType[] = ['READY_STOCK', 'MADE_TO_ORDER'];
const SORTS: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'catalog.sortNewest' },
  { value: 'price_asc', label: 'catalog.sortPriceAsc' },
  { value: 'price_desc', label: 'catalog.sortPriceDesc' },
  { value: 'rating', label: 'catalog.sortRating' },
];

/** Flattens the category tree for the sidebar (children indented). */
function flattenTree(tree: Category[]): { category: Category; depth: number }[] {
  const out: { category: Category; depth: number }[] = [];
  const walk = (nodes: Category[], depth: number) => {
    for (const node of nodes) {
      out.push({ category: node, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return out;
}

/** Catalog with sidebar filters, search, sort and pagination (prototype → Catalog). */
export function CatalogPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();

  const category = params.get('category') ?? '';
  const fulfillment = (params.get('fulfillment') as FulfillmentType | null) ?? '';
  const sort = (params.get('sort') as ProductSort | null) ?? 'newest';
  const q = params.get('q') ?? '';
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const inStock = params.get('inStock') === 'true';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  // Local echo of the search box, debounced into the URL (and the query).
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== q) update({ q: search });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  /** Merge a patch into the URL params; any filter change resets the page. */
  function update(patch: Record<string, string | undefined>, keepPage = false) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  }

  const categories = useCategories();
  const products = useProducts({
    category: category || undefined,
    q: q || undefined,
    fulfillment: fulfillment || undefined,
    minPrice: minPrice || undefined,
    maxPrice: maxPrice || undefined,
    inStock: inStock || undefined,
    sort,
    page,
    limit: PAGE_SIZE,
  });

  const total = products.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(category || q || fulfillment || minPrice || maxPrice || inStock);

  const radioClass = 'flex items-center gap-2.5 py-1.5 text-sm text-text cursor-pointer';
  const priceInputClass =
    'h-9 w-full rounded-md border border-border bg-surface-2 px-2.5 text-sm text-text-hi focus:border-volt focus:outline-none';

  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-start gap-7 px-4 py-8 md:px-6 lg:grid-cols-[250px_1fr]">
      <aside className="rounded-lg border border-border bg-surface p-5 lg:sticky lg:top-24">
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.06em] text-text-hi">
          {t('catalog.filters')}
        </h2>

        <div className="border-b border-border py-3.5">
          <h3 className="mb-2 font-body text-[13px] font-semibold uppercase tracking-[0.06em] text-text-hi">
            {t('catalog.category')}
          </h3>
          <label className={radioClass}>
            <input
              type="radio"
              name="category"
              checked={category === ''}
              onChange={() => update({ category: undefined })}
              className="h-4 w-4 accent-volt"
            />
            {t('catalog.allCategories')}
          </label>
          {categories.data &&
            flattenTree(categories.data).map(({ category: cat, depth }) => (
              <label key={cat.id} className={radioClass} style={{ paddingLeft: depth * 16 }}>
                <input
                  type="radio"
                  name="category"
                  checked={category === cat.slug}
                  onChange={() => update({ category: cat.slug })}
                  className="h-4 w-4 accent-volt"
                />
                {cat.name}
                <span className="ml-auto text-xs text-text-dim tabular-nums">
                  {cat.productCount}
                </span>
              </label>
            ))}
        </div>

        <div className="border-b border-border py-3.5">
          <h3 className="mb-2 font-body text-[13px] font-semibold uppercase tracking-[0.06em] text-text-hi">
            {t('catalog.fulfillment')}
          </h3>
          <label className={radioClass}>
            <input
              type="radio"
              name="fulfillment"
              checked={fulfillment === ''}
              onChange={() => update({ fulfillment: undefined })}
              className="h-4 w-4 accent-volt"
            />
            {t('catalog.fulfillmentAny')}
          </label>
          {FULFILLMENTS.map((type) => (
            <label key={type} className={radioClass}>
              <input
                type="radio"
                name="fulfillment"
                checked={fulfillment === type}
                onChange={() => update({ fulfillment: type })}
                className="h-4 w-4 accent-volt"
              />
              {t(type === 'READY_STOCK' ? 'catalog.readyStock' : 'catalog.madeToOrder')}
            </label>
          ))}
        </div>

        <div className="border-b border-border py-3.5">
          <h3 className="mb-2 font-body text-[13px] font-semibold uppercase tracking-[0.06em] text-text-hi">
            {t('catalog.price')}
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder={t('catalog.priceMin')}
              aria-label={t('catalog.priceMin')}
              defaultValue={minPrice}
              key={`min-${minPrice}`}
              onBlur={(e) => update({ minPrice: e.target.value.trim() || undefined })}
              className={priceInputClass}
            />
            <span className="text-text-dim">—</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder={t('catalog.priceMax')}
              aria-label={t('catalog.priceMax')}
              defaultValue={maxPrice}
              key={`max-${maxPrice}`}
              onBlur={(e) => update({ maxPrice: e.target.value.trim() || undefined })}
              className={priceInputClass}
            />
          </div>
        </div>

        <div className="py-3.5">
          <label className={radioClass}>
            <input
              type="checkbox"
              checked={inStock}
              onChange={(e) => update({ inStock: e.target.checked ? 'true' : undefined })}
              className="h-4 w-4 accent-volt"
            />
            {t('catalog.inStockOnly')}
          </label>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-volt-400 hover:text-text-hi"
          >
            <Icon name="x" className="!h-3.5 !w-3.5" />
            {t('catalog.reset')}
          </button>
        )}
      </aside>

      <div>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-text-dim">
              <Icon name="search" className="!h-[18px] !w-[18px]" />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('catalog.searchPlaceholder')}
              aria-label={t('catalog.searchLabel')}
              className="h-10 w-full rounded-pill border border-border bg-surface pl-10 pr-4 text-sm text-text placeholder:text-text-dim focus:border-volt focus:outline-none focus:shadow-glow-volt"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-text-lo">
            {t('catalog.sort')}
            <select
              value={sort}
              onChange={(e) => update({ sort: e.target.value })}
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-hi focus:border-volt focus:outline-none"
            >
              {SORTS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {products.data && (
          <p className="mb-4 text-sm text-text-dim" aria-live="polite">
            {t('catalog.results', { count: total })}
          </p>
        )}

        {products.isLoading && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-[290px] animate-pulse rounded-lg bg-surface" />
            ))}
          </div>
        )}

        {products.isError && (
          <div className="rounded-lg border border-border bg-surface px-6 py-14 text-center">
            <p className="mb-4 text-text-lo">{t('catalog.error')}</p>
            <Button variant="secondary" onClick={() => void products.refetch()}>
              <Icon name="refresh" />
              {t('catalog.retry')}
            </Button>
          </div>
        )}

        {products.data && products.data.data.length === 0 && (
          <div className="rounded-lg border border-border bg-surface px-6 py-14 text-center text-text-lo">
            <Icon name="search" className="mb-3 !h-9 !w-9 opacity-70" />
            <p>{t('catalog.empty')}</p>
          </div>
        )}

        {products.data && products.data.data.length > 0 && (
          <>
            <div
              className={`grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5 ${products.isPlaceholderData ? 'opacity-60' : ''}`}
            >
              {products.data.data.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            {pages > 1 && (
              <nav className="mt-7 flex items-center justify-center gap-3" aria-label="Pagination">
                <Button
                  variant="ghost"
                  disabled={page <= 1}
                  onClick={() => update({ page: String(page - 1) }, true)}
                  aria-label={t('catalog.prev')}
                >
                  <Icon name="arrow-left" />
                </Button>
                <span className="text-sm text-text-lo tabular-nums">
                  {t('catalog.page', { page, pages })}
                </span>
                <Button
                  variant="ghost"
                  disabled={page >= pages}
                  onClick={() => update({ page: String(page + 1) }, true)}
                  aria-label={t('catalog.next')}
                >
                  <Icon name="arrow-right" />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
