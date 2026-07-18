import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { useOrders } from '../features/cart/api';
import { formatMoney } from '../features/catalog/format';
import type { Order, OrderStatus } from '@advault/types';

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-[rgba(245,183,64,0.14)] text-warning',
  paid: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  partially_delivered: 'bg-[rgba(34,211,238,0.14)] text-beam',
  delivered: 'bg-[rgba(43,217,166,0.14)] text-success',
  cancelled: 'bg-[rgba(255,77,109,0.14)] text-danger',
  refunded: 'bg-[rgba(255,77,109,0.14)] text-danger',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex h-6 items-center rounded-pill px-2.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {t(`orders.statuses.${status}`)}
    </span>
  );
}

/** Order history in the account area: paginated list → detail. */
export function OrdersPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const limit = 10;
  const orders = useOrders(page, limit);
  const totalPages = orders.data ? Math.max(1, Math.ceil(orders.data.meta.total / limit)) : 1;

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-10 md:px-6">
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">{t('orders.title')}</h1>

      {orders.isLoading ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : orders.isError ? (
        <>
          <Banner tone="error">{t('orders.error')}</Banner>
          <Button variant="secondary" onClick={() => void orders.refetch()}>
            {t('orders.retry')}
          </Button>
        </>
      ) : orders.data!.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="box" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="mb-5 text-text-lo">{t('orders.empty')}</p>
          <Link
            to="/catalog"
            className="bg-aurora inline-flex h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold text-white shadow-glow-volt transition-transform duration-[140ms] hover:-translate-y-px"
          >
            {t('orders.browse')} <Icon name="arrow-right" className="!h-4 !w-4" />
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {orders.data!.data.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav
              className="mt-5 flex items-center justify-center gap-3"
              aria-label={t('orders.pagination')}
            >
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="arrow-left" className="!h-3 !w-3" /> {t('orders.prev')}
              </Button>
              <span className="text-[13px] tabular-nums text-text-lo">
                {t('orders.page', { page, total: totalPages })}
              </span>
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('orders.next')} <Icon name="arrow-right" className="!h-3 !w-3" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const { t, i18n } = useTranslation();
  const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Link
      to={`/orders/${order.id}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-5 py-4 shadow-2 transition-all duration-[140ms] hover:-translate-y-px hover:border-volt"
    >
      <div>
        <div className="mb-1 flex items-center gap-2.5">
          <span className="font-display text-[15px] font-bold text-text-hi">{order.number}</span>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="text-[13px] text-text-lo">
          {new Date(order.createdAt).toLocaleString(i18n.resolvedLanguage, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}{' '}
          · {t('orders.items', { count: quantity })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-display text-[17px] font-bold tabular-nums text-text-hi">
          {formatMoney(order.total, order.currency)}
        </span>
        <Icon name="arrow-right" className="!h-4 !w-4 text-text-dim" />
      </div>
    </Link>
  );
}
