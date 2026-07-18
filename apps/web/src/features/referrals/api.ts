import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../auth/useAuth';
import type {
  AdminReferral,
  AdminReferralList,
  CancelReferralRequest,
  MyReferral,
  ReferralStatus,
} from '@advault/types';

// ---------- Buyer ----------

/** The current user's invite code, link, reward terms, stats and referrals. */
export function useMyReferral() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['referrals', 'me'],
    queryFn: () => apiFetch<MyReferral>('/referrals/me'),
    enabled: Boolean(user),
  });
}

// ---------- Admin ----------

export function useAdminReferrals(page = 1, status?: ReferralStatus) {
  const { user } = useAuth();
  const search = new URLSearchParams({ page: String(page) });
  if (status) search.set('status', status);
  return useQuery({
    queryKey: ['admin', 'referrals', page, status],
    queryFn: () => apiFetch<AdminReferralList>(`/admin/referrals?${search.toString()}`),
    enabled: Boolean(user),
  });
}

export function useCancelReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CancelReferralRequest & { id: string }) =>
      apiFetch<AdminReferral>(`/admin/referrals/${id}/cancel`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] });
    },
  });
}
