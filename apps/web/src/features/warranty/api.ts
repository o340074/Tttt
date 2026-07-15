import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../auth/useAuth';
import { useContentLocale } from '../catalog/api';
import type {
  AdminWarrantyClaimDetail,
  AdminWarrantyClaimListItem,
  CreateWarrantyClaimRequest,
  Paginated,
  ResolveWarrantyClaimRequest,
  WarrantyClaimResult,
  WarrantyClaimStatus,
  WarrantyClaimView,
} from '@advault/types';

// ---------- Buyer portal ----------

export function useMyWarrantyClaims(page = 1) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['warranty', 'list', page],
    queryFn: () => apiFetch<Paginated<WarrantyClaimView>>(`/warranty-claims?page=${page}`),
    enabled: Boolean(user),
  });
}

export function useMyWarrantyClaim(id: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['warranty', 'detail', id],
    queryFn: () => apiFetch<WarrantyClaimView>(`/warranty-claims/${id}`),
    enabled: Boolean(user) && Boolean(id),
  });
}

export function useCreateWarrantyClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWarrantyClaimRequest) =>
      apiFetch<WarrantyClaimView>('/warranty-claims', { method: 'POST', body }),
    onSuccess: (claim: WarrantyClaimView) => {
      void queryClient.invalidateQueries({ queryKey: ['warranty', 'list'] });
      // The order view carries per-line warranty state — refresh it too.
      void queryClient.invalidateQueries({ queryKey: ['order', claim.orderId] });
    },
  });
}

// ---------- Admin queue ----------

export interface AdminClaimFilters {
  page?: number;
  status?: WarrantyClaimStatus;
}

export function useAdminWarrantyClaims(filters: AdminClaimFilters) {
  const locale = useContentLocale();
  const search = new URLSearchParams();
  if (filters.page) search.set('page', String(filters.page));
  if (filters.status) search.set('status', filters.status);
  search.set('locale', locale);
  return useQuery({
    queryKey: ['admin', 'warranty', 'list', filters, locale],
    queryFn: () =>
      apiFetch<Paginated<AdminWarrantyClaimListItem>>(
        `/admin/warranty-claims?${search.toString()}`,
      ),
  });
}

export function useAdminWarrantyClaim(id: string | undefined) {
  const locale = useContentLocale();
  return useQuery({
    queryKey: ['admin', 'warranty', 'detail', id, locale],
    queryFn: () =>
      apiFetch<AdminWarrantyClaimDetail>(`/admin/warranty-claims/${id}?locale=${locale}`),
    enabled: Boolean(id),
  });
}

function useClaimInvalidation(id: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'warranty', 'detail', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'warranty', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
  };
}

export function useApproveClaim(id: string) {
  const invalidate = useClaimInvalidation(id);
  return useMutation({
    mutationFn: (body: ResolveWarrantyClaimRequest) =>
      apiFetch<WarrantyClaimResult>(`/admin/warranty-claims/${id}/approve`, {
        method: 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useRejectClaim(id: string) {
  const invalidate = useClaimInvalidation(id);
  return useMutation({
    mutationFn: (body: ResolveWarrantyClaimRequest) =>
      apiFetch<WarrantyClaimResult>(`/admin/warranty-claims/${id}/reject`, {
        method: 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
}

/** Fulfillment moves money/assets — idempotent, FINANCE_STAFF-gated server-side. */
export function useFulfillClaim(id: string) {
  const invalidate = useClaimInvalidation(id);
  return useMutation({
    mutationFn: () =>
      apiFetch<WarrantyClaimResult>(`/admin/warranty-claims/${id}/fulfill`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: invalidate,
  });
}
