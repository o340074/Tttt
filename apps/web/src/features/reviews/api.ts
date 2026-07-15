import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../auth/useAuth';
import { useContentLocale } from '../catalog/api';
import type {
  AdminReviewListItem,
  CreateReviewRequest,
  ModerateReviewRequest,
  Paginated,
  ProductReview,
  ProductReviewsResponse,
} from '@advault/types';

// ---------- Public / buyer ----------

export function useProductReviews(slug: string, page = 1) {
  return useQuery({
    queryKey: ['reviews', slug, page],
    queryFn: () =>
      apiFetch<ProductReviewsResponse>(`/products/${slug}/reviews?page=${page}`),
    enabled: Boolean(slug),
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReviewRequest) =>
      apiFetch<ProductReview>('/reviews', { method: 'POST', body }),
    onSuccess: () => {
      // The order view carries per-line review eligibility — refresh orders.
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order'] });
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

// ---------- Admin moderation ----------

export function useAdminReviews(page = 1, hidden?: boolean) {
  const locale = useContentLocale();
  const { user } = useAuth();
  const search = new URLSearchParams({ page: String(page) });
  if (hidden !== undefined) search.set('hidden', String(hidden));
  return useQuery({
    queryKey: ['admin', 'reviews', page, hidden, locale],
    queryFn: () => apiFetch<Paginated<AdminReviewListItem>>(`/admin/reviews?${search.toString()}`),
    enabled: Boolean(user),
  });
}

export function useModerateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ModerateReviewRequest & { id: string }) =>
      apiFetch<AdminReviewListItem>(`/admin/reviews/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
    },
  });
}
