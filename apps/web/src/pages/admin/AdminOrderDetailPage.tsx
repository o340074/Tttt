import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAdminOrder, useManualDeliver, useRefundOrder } from '../../features/admin/api';
import { useAuth } from '../../features/auth/useAuth';
import { DeliveryStatusBadge, OrderStatusBadge } from '../../features/admin/badges';
import { formatMoney } from '../../features/catalog/format';
import type { AdminOrderDetail, OrderItem } from '@advault/types';

/** Roles allowed to refund / manually deliver (FINANCE_STAFF on the API). */
const CAN_ACT = new Set(['manager', 'admin']);

/** Admin order detail (docs/13): buyer, lines, warming progress. No secrets. */
export function AdminOrderDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canAct = Boolean(user && CAN_ACT.has(user.role));
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

          {canAct && <OrderActions order={order.data!} />}

          <div className="flex flex-col gap-3">
            {order.data!.items.map((item) => (
              <OrderItemRow
                key={item.id}
                orderId={order.data!.id}
                item={item}
                currency={order.data!.currency}
                canAct={canAct}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Whole-order refund (money-touching, danger-confirm + audit on the API). */
function OrderActions({ order }: { order: AdminOrderDetail }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refund = useRefundOrder(order.id);
  const refundable = order.items.some((i) => i.deliveryStatus !== 'refunded');

  const doRefund = () => {
    setError(null);
    if (!reason.trim()) return setError(t('admin.orders.reasonRequired'));
    if (!window.confirm(t('admin.orders.refundConfirmOrder'))) return;
    refund.mutate(
      { reason: reason.trim() },
      { onError: () => setError(t('admin.orders.actionError')), onSuccess: () => setReason('') },
    );
  };

  if (!refundable) return null;
  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-dim">
        {t('admin.orders.actions')}
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('admin.orders.reasonPlaceholder')}
          aria-label={t('admin.orders.reason')}
          className="h-11 min-w-[220px] flex-1 rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt"
        />
        <Button
          variant="ghost"
          className="!border-danger/50 !text-danger hover:!bg-[rgba(255,77,109,0.08)]"
          loading={refund.isPending}
          onClick={doRefund}
        >
          <Icon name="refresh" className="!h-4 !w-4" /> {t('admin.orders.refundOrder')}
        </Button>
      </div>
    </div>
  );
}

function OrderItemRow({
  orderId,
  item,
  currency,
  canAct,
}: {
  orderId: string;
  item: OrderItem;
  currency: string;
  canAct: boolean;
}) {
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

      {canAct && !warming && <ItemActions orderId={orderId} item={item} currency={currency} />}

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

/**
 * Per-line finance actions for non-warm lines: refund the line, or manually
 * deliver (enter the payload by hand). Both are money/secret-touching and gated
 * to managers/admins on the API, with a danger-confirm here.
 */
function ItemActions({
  orderId,
  item,
  currency,
}: {
  orderId: string;
  item: OrderItem;
  currency: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<'none' | 'deliver'>('none');
  const [payload, setPayload] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refund = useRefundOrder(orderId);
  const deliver = useManualDeliver(orderId);

  const terminal = item.deliveryStatus === 'refunded' || item.deliveryStatus === 'replaced';
  const delivered = item.deliveryStatus === 'delivered';
  const lineTotal = (Number(item.unitPrice) * item.quantity).toFixed(2);

  const doRefund = () => {
    setError(null);
    if (!reason.trim()) return setError(t('admin.orders.reasonRequired'));
    if (
      !window.confirm(
        t('admin.orders.refundConfirmLine', { amount: formatMoney(lineTotal, currency) }),
      )
    )
      return;
    refund.mutate(
      { orderItemId: item.id, reason: reason.trim() },
      { onError: () => setError(t('admin.orders.actionError')), onSuccess: () => setReason('') },
    );
  };

  const doDeliver = () => {
    setError(null);
    if (!payload.trim()) return;
    if (!window.confirm(t('admin.orders.deliverConfirm'))) return;
    deliver.mutate(
      { itemId: item.id, payload: payload.trim(), note: note.trim() || undefined },
      {
        onError: () => setError(t('admin.orders.actionError')),
        onSuccess: () => {
          setPayload('');
          setNote('');
          setOpen('none');
        },
      },
    );
  };

  if (terminal) return null;

  return (
    <div className="mt-3 border-t border-border pt-3">
      {error && <Banner tone="error">{error}</Banner>}
      <div className="flex flex-wrap items-center gap-2">
        {!delivered && (
          <Button
            variant="ghost"
            className="!h-9 !px-3 text-xs"
            onClick={() => setOpen((v) => (v === 'deliver' ? 'none' : 'deliver'))}
          >
            <Icon name="vault" className="!h-3.5 !w-3.5" /> {t('admin.orders.deliverManual')}
          </Button>
        )}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('admin.orders.reasonPlaceholder')}
          aria-label={t('admin.orders.reason')}
          className="h-9 min-w-[180px] flex-1 rounded-md border border-border bg-surface-2 px-3 text-xs text-text-hi outline-none focus:border-volt"
        />
        <Button
          variant="ghost"
          className="!h-9 !px-3 text-xs !border-danger/50 !text-danger hover:!bg-[rgba(255,77,109,0.08)]"
          loading={refund.isPending}
          onClick={doRefund}
        >
          {t('admin.orders.refundLine')}
        </Button>
      </div>

      {open === 'deliver' && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="mb-2 text-xs font-semibold text-text-lo">
            {t('admin.orders.deliverTitle')}
          </div>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={3}
            placeholder={t('admin.orders.deliverPayloadPlaceholder')}
            aria-label={t('admin.orders.deliverPayload')}
            className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-text-hi outline-none focus:border-volt"
          />
          <p className="mt-1 text-[11px] text-text-dim">{t('admin.orders.deliverPayloadHint')}</p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('admin.orders.deliverNote')}
            aria-label={t('admin.orders.deliverNote')}
            className="mt-2 h-9 w-full rounded-md border border-border bg-surface px-3 text-xs text-text-hi outline-none focus:border-volt"
          />
          <Button
            className="mt-3 !h-9 text-xs"
            loading={deliver.isPending}
            disabled={!payload.trim()}
            onClick={doDeliver}
          >
            {t('admin.orders.deliverSubmit')}
          </Button>
        </div>
      )}
    </div>
  );
}
