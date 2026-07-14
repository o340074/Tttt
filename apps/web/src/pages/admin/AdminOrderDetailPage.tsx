import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAdminOrder } from '../../features/admin/api';
import { DeliveryStatusBadge, OrderStatusBadge } from '../../features/admin/badges';
import { formatMoney } from '../../features/catalog/format';
import type { OrderItem } from '@advault/types';

/** Admin order detail (docs/13): buyer, lines, warming progress. No secrets. */
export function AdminOrderDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const order = useAdminOrder(id);

  return (
    <div className="mx-auto w-full max-w-[920px] px-4 py-8 md:px-8">
      <Link
        to="/admin/orders"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-text-lo hover:text-text-hi"
      >
        <Icon name="arrow-left" className="!h-3.5 !w-3.5" /> {t('admin.orders.back')}
      </Link>

      {order.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface" aria-hidden />
      ) : order.isError ? (
        <>
          <Banner tone="error">{t('admin.orders.detailError')}</Banner>
          <Button variant="secondary" onClick={() => void order.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl font-bold text-text-hi">
                  {order.data!.number}
                </h1>
                <OrderStatusBadge status={order.data!.status} />
              </div>
              <p className="mt-1 text-sm text-text-lo">
                {order.data!.buyer.email} ·{' '}
                {new Date(order.data!.createdAt).toLocaleString(i18n.resolvedLanguage, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl font-bold tabular-nums text-text-hi">
                {formatMoney(order.data!.total, order.data!.currency)}
              </div>
              {Number(order.data!.discount) > 0 && (
                <div className="text-xs text-text-dim">
                  {t('admin.orders.discount')}: −
                  {formatMoney(order.data!.discount, order.data!.currency)}
                  {order.data!.promoCode ? ` · ${order.data!.promoCode}` : ''}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {order.data!.items.map((item) => (
              <OrderItemRow key={item.id} item={item} currency={order.data!.currency} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OrderItemRow({ item, currency }: { item: OrderItem; currency: string }) {
  const { t } = useTranslation();
  const warming = item.warming;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-text-hi">{item.name}</div>
          <div className="mt-0.5 text-xs text-text-dim">
            {item.sku} · ×{item.quantity} · {t(`admin.deliveryTypes.${item.deliveryType}`)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DeliveryStatusBadge status={item.deliveryStatus} />
          <span className="font-display font-bold tabular-nums text-text-hi">
            {formatMoney(item.unitPrice, currency)}
          </span>
        </div>
      </div>

      {warming && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between text-xs text-text-lo">
            <span>
              {t('admin.orders.warmProgress', {
                current: warming.currentStage,
                total: warming.totalStages,
              })}
            </span>
            {warming.etaAt && (
              <span className="text-text-dim">
                {t('admin.orders.eta')}:{' '}
                {new Date(warming.etaAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {warming.stages.map((stage) => (
              <div
                key={stage.order}
                title={stage.name}
                className={`h-1.5 flex-1 rounded-pill ${
                  stage.status === 'done'
                    ? 'bg-success'
                    : stage.status === 'in_progress'
                      ? 'bg-volt'
                      : 'bg-border-2'
                }`}
              />
            ))}
          </div>
          <Link
            to="/admin/warming"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-volt-400 hover:underline"
          >
            {t('admin.orders.openWorkspace')} <Icon name="arrow-right" className="!h-3 !w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
