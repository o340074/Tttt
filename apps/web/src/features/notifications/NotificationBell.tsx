import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from './api';
import type { NotificationView } from '@advault/types';

/** Deep-link target for a notification (order/ticket). */
function linkFor(n: NotificationView): string | null {
  if (n.data.ticketId) return `/support/${n.data.ticketId}`;
  if (n.data.orderId) return `/orders/${n.data.orderId}`;
  return null;
}

export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const unread = useUnreadCount();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  // Only fetch the list while the panel is open (the badge polls on its own).
  useEffect(() => {
    if (open) void notifications.refetch();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onOpen = (n: NotificationView) => {
    if (!n.readAt) markRead.mutate(n.id);
    const to = linkFor(n);
    setOpen(false);
    if (to) navigate(to);
  };

  const items = notifications.data?.data ?? [];

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unread > 0
            ? t('notifications.ariaWithCount', { count: unread })
            : t('notifications.title')
        }
        aria-expanded={open}
        aria-haspopup="true"
        className="relative grid h-10 w-10 place-items-center rounded-pill border border-border bg-surface text-text transition-all duration-[140ms] hover:-translate-y-px hover:border-border-2 hover:text-text-hi"
      >
        <Icon name="bell" className="!h-[18px] !w-[18px]" />
        {unread > 0 && (
          <span
            aria-hidden
            className="bg-aurora absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-pill px-1 text-[10.5px] font-bold tabular-nums text-white shadow-glow-volt"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-[120] w-[340px] max-w-[92vw] overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-display text-sm font-bold text-text-hi">
              {t('notifications.title')}
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-xs font-semibold text-volt transition-colors hover:text-text-hi disabled:opacity-50"
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {notifications.isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-text-lo">
                {t('notifications.loading')}
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-text-lo">
                {t('notifications.empty')}
              </p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onOpen(n)}
                      className={`flex w-full flex-col gap-1 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${
                        n.readAt ? 'opacity-70' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {!n.readAt && (
                          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-volt" />
                        )}
                        <span className="text-sm font-semibold text-text-hi">{n.title}</span>
                      </span>
                      <span className="text-xs text-text-lo">{n.body}</span>
                      <span className="text-[11px] text-text-lo/70">
                        {new Date(n.createdAt).toLocaleString(i18n.resolvedLanguage)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
