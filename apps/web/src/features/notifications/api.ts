import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getAccessToken } from '../../lib/api';
import { useAuth } from '../auth/useAuth';
import type {
  NotificationSocketMessage,
  NotificationView,
  Paginated,
  UnreadCountResponse,
} from '@advault/types';

const UNREAD_KEY = ['notifications', 'unread-count'] as const;

/** Build the ws(s):// URL for the realtime badge, same-origin behind `/api`. */
function socketUrl(token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/ws/notifications?token=${encodeURIComponent(token)}`;
}

/**
 * The unread badge count (E9). A WebSocket pushes the count in realtime; the
 * query below is the seed and the fallback — it polls every 30s while the socket
 * is down and backs off to a slow safety poll once the socket is live. So the
 * badge stays correct whether or not the socket connects (degrades to polling).
 */
export function useUnreadCount(): number {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [socketUp, setSocketUp] = useState(false);

  const query = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => apiFetch<UnreadCountResponse>('/notifications/unread-count'),
    enabled: Boolean(user),
    refetchInterval: socketUp ? 300_000 : 30_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!user) return;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let closed = false;

    const connect = () => {
      const token = getAccessToken();
      if (closed || !token) return;
      try {
        ws = new WebSocket(socketUrl(token));
      } catch {
        scheduleRetry();
        return;
      }
      ws.onopen = () => {
        attempt = 0;
        setSocketUp(true);
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as NotificationSocketMessage;
          if (msg.type === 'unread') {
            queryClient.setQueryData<UnreadCountResponse>(UNREAD_KEY, { unread: msg.unread });
            // A change in count means the feed changed too — refresh an open panel.
            void queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
          }
        } catch {
          // Ignore malformed frames.
        }
      };
      ws.onclose = () => {
        setSocketUp(false);
        scheduleRetry();
      };
      ws.onerror = () => ws?.close();
    };

    const scheduleRetry = () => {
      if (closed) return;
      // Exponential backoff, capped — the query keeps polling meanwhile.
      const delay = Math.min(30_000, 1_000 * 2 ** attempt);
      attempt += 1;
      retry = setTimeout(connect, delay);
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      if (ws) {
        ws.onclose = null; // avoid a reconnect on intentional teardown
        ws.close();
      }
      setSocketUp(false);
    };
  }, [user, queryClient]);

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
