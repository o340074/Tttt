import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../auth/useAuth';
import type {
  CreateMyTicketMessageRequest,
  CreateMyTicketRequest,
  Paginated,
  TicketDetailView,
  TicketStatus,
  TicketSummary,
} from '@advault/types';

export interface MyTicketFilters {
  page?: number;
  status?: TicketStatus;
}

export function useMyTickets(filters: MyTicketFilters = {}) {
  const { user } = useAuth();
  const search = new URLSearchParams();
  if (filters.page) search.set('page', String(filters.page));
  if (filters.status) search.set('status', filters.status);
  const qs = search.toString();
  return useQuery({
    queryKey: ['tickets', 'list', filters],
    queryFn: () => apiFetch<Paginated<TicketSummary>>(`/tickets${qs ? `?${qs}` : ''}`),
    enabled: Boolean(user),
  });
}

export function useMyTicket(id: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['tickets', 'detail', id],
    queryFn: () => apiFetch<TicketDetailView>(`/tickets/${id}`),
    enabled: Boolean(user) && Boolean(id),
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMyTicketRequest) =>
      apiFetch<TicketDetailView>('/tickets', { method: 'POST', body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tickets', 'list'] }),
  });
}

export function useReplyTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMyTicketMessageRequest) =>
      apiFetch<TicketDetailView>(`/tickets/${id}/messages`, { method: 'POST', body }),
    onSuccess: (detail: TicketDetailView) => {
      queryClient.setQueryData(['tickets', 'detail', id], detail);
      void queryClient.invalidateQueries({ queryKey: ['tickets', 'list'] });
    },
  });
}
