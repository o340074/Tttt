import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import { StockBadge } from './StockBadge';
import { catalogIcon, formatEta, formatMoney } from './format';
import type { IconName } from '../../components/ui/Icon';
import type { ProductListItem } from '@advault/types';

/** Catalog/storefront product card (prototype .pcard). */
export function ProductCard({ product }: { product: ProductListItem }) {
  const { t } = useTranslation();
  const icon = catalogIcon(product.attributes, product.categorySlug) as IconName;
  const warmOnly = !product.fulfillmentTypes.includes('READY_STOCK');

  return (
    <Link
      to={`/product/${product.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface p-[18px] transition-all duration-[200ms] hover:-translate-y-1 hover:border-volt hover:shadow-3"
    >
      <div className="mb-3.5 grid h-[116px] place-items-center rounded-md bg-gradient-to-br from-surface-2 to-surface-3">
        <Icon name={icon} className="!h-[52px] !w-[52px] drop-shadow-lg" />
      </div>
      <div className="mb-2">
        <StockBadge fulfillmentTypes={product.fulfillmentTypes} stockCount={product.stockCount} />
      </div>
      <h4 className="mb-1 font-body text-base font-bold text-text-hi">{product.name}</h4>
      <p className="mb-3 text-[13px] text-text-lo">
        {warmOnly && product.etaMinutes !== null
          ? formatEta(t, product.etaMinutes)
          : typeof product.attributes.geo === 'string'
            ? String(product.attributes.geo)
            : ' '}
      </p>
      <div className="mt-auto flex items-center justify-between">
        <span className="font-display text-xl font-bold text-text-hi tabular-nums">
          <span className="mr-1 text-xs font-medium text-text-dim">{t('catalog.from')}</span>
          {formatMoney(product.minPrice, product.currency)}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-volt-400 opacity-0 transition-opacity duration-[140ms] group-hover:opacity-100">
          <Icon name="arrow-right" />
        </span>
      </div>
    </Link>
  );
}
