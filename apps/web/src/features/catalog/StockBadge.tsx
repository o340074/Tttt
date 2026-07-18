import { useTranslation } from 'react-i18next';
import type { FulfillmentType } from '@advault/types';

interface StockBadgeProps {
  fulfillmentTypes: FulfillmentType[];
  stockCount: number;
}

/**
 * Availability badge (prototype .badge): green pulsing dot for stock,
 * amber for made-to-order, red for out of stock.
 */
export function StockBadge({ fulfillmentTypes, stockCount }: StockBadgeProps) {
  const { t } = useTranslation();

  if (fulfillmentTypes.includes('READY_STOCK') && stockCount > 0) {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-success/15 px-2.5 text-xs font-semibold text-success">
        <span
          aria-hidden
          className="h-1.5 w-1.5 animate-pulse rounded-pill bg-success shadow-glow-success"
        />
        {t('product.inStock', { count: stockCount })}
      </span>
    );
  }
  if (fulfillmentTypes.includes('MADE_TO_ORDER')) {
    return (
      <span className="inline-flex h-6 items-center rounded-pill bg-warning/15 px-2.5 text-xs font-semibold text-warning">
        {t('product.madeToOrder')}
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 items-center rounded-pill bg-danger/15 px-2.5 text-xs font-semibold text-danger">
      {t('product.outOfStock')}
    </span>
  );
}
