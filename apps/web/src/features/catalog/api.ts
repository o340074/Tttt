import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiRequestError, apiFetch } from '../../lib/api';
import type {
  Category,
  FulfillmentType,
  Paginated,
  Product,
  ProductListItem,
  ProductSort,
} from '@advault/types';

/** Filters for GET /products (docs/backend/openapi.md). */
export interface ProductFilters {
  category?: string;
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  fulfillment?: FulfillmentType;
  inStock?: boolean;
  sort?: ProductSort;
  page?: number;
  limit?: number;
}

function productsQueryString(filters: ProductFilters, locale: string): string {
  const params = new URLSearchParams({ locale });
  if (filters.category) params.set('category', filters.category);
  if (filters.q) params.set('q', filters.q);
  if (filters.minPrice) params.set('minPrice', filters.minPrice);
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
  if (filters.fulfillment) params.set('fulfillment', filters.fulfillment);
  if (filters.inStock) params.set('inStock', 'true');
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  return params.toString();
}

/** Content locale for API calls — the resolved UI language. */
export function useContentLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage ?? 'en';
}

export function useCategories() {
  const locale = useContentLocale();
  return useQuery({
    queryKey: ['categories', locale],
    queryFn: () => apiFetch<Category[]>(`/categories?locale=${locale}`, { anonymous: true }),
    staleTime: 60_000,
  });
}

export function useProducts(filters: ProductFilters) {
  const locale = useContentLocale();
  const qs = productsQueryString(filters, locale);
  return useQuery({
    queryKey: ['products', qs],
    queryFn: () => apiFetch<Paginated<ProductListItem>>(`/products?${qs}`, { anonymous: true }),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useProduct(slug: string) {
  const locale = useContentLocale();
  return useQuery({
    queryKey: ['product', slug, locale],
    queryFn: () => apiFetch<Product>(`/products/${slug}?locale=${locale}`, { anonymous: true }),
    staleTime: 30_000,
    // A missing product is a terminal answer — show "not found" without retries.
    retry: (failureCount, error) =>
      !(error instanceof ApiRequestError && error.status === 404) && failureCount < 2,
  });
}
