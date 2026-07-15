import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../auth/useAuth';
import type { NotificationView, Paginated, UnreadCountResponse } from '@advault/types';

/** Polls the unread badge every 30s while signed in (E9 — polling, no socket). */
export function useUnreadCount(): number {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => apiFetch<UnreadCountResponse>('/notifications/unread-count'),
    enabled: Boolean(user),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  return query.data?.unread ?? 0;
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => apiFetch<Paginated<NotificationView>>('/notifications?limit=20'),
    enabled: Boolean(user),
  });
}

function useNotificationsInvalidation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
}

export function useMarkNotificationRead() {
  const invalidate = useNotificationsInvalidation();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<UnreadCountResponse>(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => void invalidate(),
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useNotificationsInvalidation();
  return useMutation({
    mutationFn: () => apiFetch<UnreadCountResponse>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => void invalidate(),
  });
}
