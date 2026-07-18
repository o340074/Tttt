import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAdminOrders } from '../../features/admin/api';
import { OrderStatusBadge } from '../../features/admin/badges';
import { formatMoney } from '../../features/catalog/format';
import type { OrderStatus } from '@advault/types';

const STATUSES: (OrderStatus | 'all')[] = [
  'all',
  'paid',
  'partially_delivered',
  'delivered',
  'refunded',
];

/** Admin orders table (docs/13): search + status filter + pagination. */
export function AdminOrdersPage() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const limit = 20;

  const orders = useAdminOrders({
    page,
    limit,
    status: status === 'all' ? undefined : status,
    q: q || undefined,
  });
  const totalPages = orders.data ? Math.max(1, Math.ceil(orders.data.meta.total / limit)) : 1;

  const applySearch = () => {
    setPage(1);
    setQ(search.trim());
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-8">
      <h1 className="mb-1 text-2xl font-bold">{t('admin.orders.title')}</h1>
      <p className="mb-6 text-sm text-text-lo">{t('admin.orders.subtitle')}</p>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 !h-4 !w-4 text-text-dim"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
              placeholder={t('admin.orders.searchPlaceholder')}
              aria-label={t('admin.orders.searchPlaceholder')}
              className="h-11 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text-hi outline-none focus:border-volt"
            />
          </div>
          <Button variant="secondary" className="!h-11" onClick={applySearch}>
            {t('admin.orders.searchBtn')}
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={t('admin.orders.filter')}>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            aria-pressed={status === s}
            className={`rounded-pill px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              status === s
                ? 'bg-volt text-white'
                : 'border border-border bg-surface text-text-lo hover:text-text-hi'
            }`}
          >
            {s === 'all' ? t('admin.orders.all') : t(`orders.statuses.${s}`)}
          </button>
        ))}
      </div>

      {orders.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : orders.isError ? (
        <>
          <Banner tone="error">{t('admin.orders.error')}</Banner>
          <Button variant="secondary" onClick={() => void orders.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : orders.data!.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="box" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.orders.empty')}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-semibold">{t('admin.orders.colNumber')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.orders.colBuyer')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.orders.colStatus')}</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    {t('admin.orders.colItems')}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    {t('admin.orders.colTotal')}
                  </th>
                  <th className="px-4 py-3 font-semibold">{t('admin.orders.colDate')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.data!.data.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-border last:border-0 transition-colors hover:bg-surface"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/orders/${order.id}`}
                        className="font-display font-bold text-text-hi hover:text-volt-400"
                      >
                        {order.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-lo">{order.buyer.email}</td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-lo">
                      {order.itemCount}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-text-hi">
                      {formatMoney(order.total, order.currency)}
                    </td>
                    <td className="px-4 py-3 text-text-dim">
                      {new Date(order.createdAt).toLocaleString(i18n.resolvedLanguage, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav
              className="mt-5 flex items-center justify-center gap-3"
              aria-label={t('admin.pagination')}
            >
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="arrow-left" className="!h-3 !w-3" /> {t('admin.prev')}
              </Button>
              <span className="text-[13px] tabular-nums text-text-lo">
                {t('admin.page', { page, total: totalPages })}
              </span>
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('admin.next')} <Icon name="arrow-right" className="!h-3 !w-3" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
