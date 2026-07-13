import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { useOrder } from '../features/cart/api';
import { formatMoney } from '../features/catalog/format';
import { ApiRequestError } from '../lib/api';
import { OrderStatusBadge } from './OrdersPage';
import type { OrderItem } from '@advault/types';

const DELIVERY_STYLES: Record<OrderItem['deliveryStatus'], string> = {
  pending: 'bg-[rgba(245,183,64,0.14)] text-warning',
  awaiting_manual: 'bg-[rgba(34,211,238,0.14)] text-beam',
  delivered: 'bg-[rgba(43,217,166,0.14)] text-success',
  replaced: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
};

/** Single order: items with delivery statuses and the money breakdown. */
export function OrderPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const order = useOrder(id);

  if (order.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 py-10 md:px-6">
        <div className="h-[340px] animate-pulse rounded-lg bg-surface" />
      </div>
    );
  }

  if (order.isError) {
    const notFound = order.error instanceof ApiRequestError && order.error.status === 404;
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 py-16 text-center md:px-6">
        <h1 className="mb-4 text-2xl font-bold">
          {notFound ? t('orders.notFound') : t('orders.error')}
        </h1>
        <Link
          to="/orders"
          className="inline-flex items-center gap-2 font-semibold text-volt-400 hover:text-text-hi"
        >
          <Icon name="arrow-left" className="!h-4 !w-4" /> {t('orders.back')}
        </Link>
      </div>
    );
  }

  const data = order.data!;

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-10 md:px-6">
      <Link
        to="/orders"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-text-lo hover:text-text-hi"
      >
        <Icon name="arrow-left" className="!h-4 !w-4" /> {t('orders.back')}
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">
          {t('orders.detailTitle', { number: data.number })}
        </h1>
        <OrderStatusBadge status={data.status} />
      </div>
      <p className="mb-6 text-[13.5px] text-text-lo">
        {new Date(data.createdAt).toLocaleString(i18n.resolvedLanguage, {
          dateStyle: 'long',
          timeStyle: 'short',
        })}
      </p>

      <section className="mb-6 rounded-lg border border-border bg-surface px-6 py-2 shadow-2">
        <h2 className="py-4 text-[17px] font-bold">{t('orders.itemsHeading')}</h2>
        {data.items.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4"
          >
            <div className="min-w-0">
              <div className="mb-1 truncate text-[15px] font-bold text-text-hi">
                {item.name}{' '}
                <span className="font-normal text-text-lo">
                  {t('orders.qty', { count: item.quantity })}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-lo">
                <span className="uppercase tracking-[0.04em] text-text-dim">{item.sku}</span>
                <span className="tabular-nums">
                  {t('orders.unitPrice', { price: formatMoney(item.unitPrice, data.currency) })}
                </span>
              </div>
            </div>
            <span
              className={`inline-flex h-6 items-center rounded-pill px-2.5 text-xs font-semibold ${DELIVERY_STYLES[item.deliveryStatus]}`}
            >
              {t(`orders.deliveryStatuses.${item.deliveryStatus}`)}
            </span>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-surface p-6 shadow-2">
        <div className="flex items-center justify-between py-1.5 text-sm text-text-lo">
          <span>{t('orders.subtotal')}</span>
          <span className="font-semibold tabular-nums text-text">
            {formatMoney(data.subtotal, data.currency)}
          </span>
        </div>
        {data.promoCode && (
          <div className="flex items-center justify-between py-1.5 text-sm text-text-lo">
            <span>
              {t('orders.discount')}{' '}
              <span className="ml-1 inline-flex h-6 items-center rounded-pill bg-[rgba(43,217,166,0.16)] px-2.5 text-xs font-semibold text-success">
                {data.promoCode}
              </span>
            </span>
            <span className="font-semibold tabular-nums text-success">
              −{formatMoney(data.discount, data.currency)}
            </span>
          </div>
        )}
        <div className="my-3 h-px bg-border" />
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold text-text-hi">{t('orders.totalLabel')}</span>
          <span className="font-display text-[26px] font-extrabold tabular-nums text-text-hi">
            {formatMoney(data.total, data.currency)}
          </span>
        </div>
      </section>

      <p className="mt-4 text-center text-[12.5px] text-text-dim">{t('orders.deliveryNote')}</p>
    </div>
  );
}
