import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import type { CreateTopUpRequest, LedgerEntry, Paginated, TopUp, Wallet } from '@advault/types';

const POLL_INTERVAL_MS = 3000;

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiFetch<Wallet>('/wallet'),
  });
}

export function useTransactions(page: number, limit = 10) {
  return useQuery({
    queryKey: ['wallet', 'transactions', page, limit],
    queryFn: () =>
      apiFetch<Paginated<LedgerEntry>>(`/wallet/transactions?page=${page}&limit=${limit}`),
    placeholderData: (previous) => previous,
  });
}

export function useCreateTopUp() {
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreateTopUpRequest; idempotencyKey: string }) =>
      apiFetch<TopUp>('/wallet/topups', {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
  });
}

/** Polls the top-up while it stays pending; stops on any terminal status. */
export function useTopUpStatus(id: string | null) {
  return useQuery({
    queryKey: ['wallet', 'topup', id],
    queryFn: () => apiFetch<TopUp>(`/wallet/topups/${id}`),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false),
  });
}

/** After a credit lands, balance, history and /me all changed. */
export function useInvalidateWallet() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['wallet'] });
}
