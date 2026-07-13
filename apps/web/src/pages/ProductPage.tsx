import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { errorKey } from '../features/auth/errors';
import { useAuth } from '../features/auth/useAuth';
import { useAddCartItem } from '../features/cart/api';
import { StockBadge } from '../features/catalog/StockBadge';
import { useProduct } from '../features/catalog/api';
import { catalogIcon, formatEta, formatMoney } from '../features/catalog/format';
import { ApiRequestError } from '../lib/api';
import type { IconName } from '../components/ui/Icon';
import type { BundleComponentType, ProductVariant } from '@advault/types';

const BUNDLE_ICONS: Record<BundleComponentType, IconName> = {
  ACCOUNT: 'user',
  PROXY: 'globe',
  OCTO_PROFILE: 'shield',
  RECOVERY: 'refresh',
  SECRETS: 'lock',
  GUIDE: 'info',
  WARRANTY: 'verify',
};

/** "Buy now": puts the variant into the cart and goes to checkout (guests log in first). */
function BuyNowButton({ variant }: { variant: ProductVariant }) {
  const { t } = useTranslation();
  const { user, booting } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const addItem = useAddCartItem();

  const outOfStock = variant.fulfillmentType === 'READY_STOCK' && variant.stockCount === 0;

  const buy = (): void => {
    if (!user) {
      navigate('/auth/login', { state: { from: location.pathname } });
      return;
    }
    addItem.mutate(
      { variantId: variant.id, quantity: 1 },
      { onSuccess: () => navigate('/checkout') },
    );
  };

  return (
    <>
      {addItem.isError && <Banner tone="error">{t(errorKey(addItem.error))}</Banner>}
      <Button block loading={addItem.isPending} disabled={booting || outOfStock} onClick={buy}>
        <Icon name="cart" className="!h-4 !w-4" />{' '}
        {outOfStock ? t('product.outOfStock') : t('product.buyNow')}
      </Button>
    </>
  );
}

function VariantAvailability({ variant }: { variant: ProductVariant }) {
  const { t } = useTranslation();
  if (variant.fulfillmentType === 'MADE_TO_ORDER') {
    return (
      <div className="text-[13px] text-text-dim">
        {variant.etaMinutes !== null
          ? t('product.etaLabel', { eta: formatEta(t, variant.etaMinutes) })
          : t('product.warmDelivery')}
      </div>
    );
  }
  return <div className="text-[13px] text-text-dim">{t('product.instantDelivery')}</div>;
}

/** Product card with variant picker, fulfillment/ETA and bundle (prototype → Product). */
export function ProductPage() {
  const { t } = useTranslation();
  const { slug = '' } = useParams();
  const product = useProduct(slug);

  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  useEffect(() => setSelectedSku(null), [slug]);

  if (product.isLoading) {
    return (
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-start gap-8 px-4 py-10 md:px-6 lg:grid-cols-[1fr_400px]">
        <div className="h-[320px] animate-pulse rounded-lg bg-surface" />
        <div className="h-[420px] animate-pulse rounded-lg bg-surface" />
      </div>
    );
  }

  if (product.isError) {
    const notFound = product.error instanceof ApiRequestError && product.error.status === 404;
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-20 text-center md:px-6">
        <h1 className="mb-3 text-2xl font-bold">
          {notFound ? t('product.notFound') : t('product.error')}
        </h1>
        <Link
          to="/catalog"
          className="inline-flex items-center gap-2 font-semibold text-volt-400 hover:text-text-hi"
        >
          <Icon name="arrow-left" />
          {t('product.backToCatalog')}
        </Link>
      </div>
    );
  }

  const data = product.data;
  if (!data) return null;

  const variant = data.variants.find((v) => v.sku === selectedSku) ?? data.variants[0] ?? null;
  const icon = catalogIcon(data.attributes, data.categorySlug) as IconName;
  const geo = typeof data.attributes.geo === 'string' ? data.attributes.geo : null;
  const kind = typeof data.attributes.kind === 'string' ? data.attributes.kind : null;

  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-start gap-8 px-4 py-10 md:px-6 lg:grid-cols-[1fr_400px]">
      <div>
        <Link
          to="/catalog"
          className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-text-lo hover:text-text-hi"
        >
          <Icon name="arrow-left" />
          {t('product.backToCatalog')}
        </Link>
        <div className="grid h-[320px] place-items-center rounded-lg border border-border bg-gradient-to-br from-surface-2 to-surface-3">
          <Icon name={icon} className="!h-[94px] !w-[94px] drop-shadow-xl" />
        </div>
        <div className="mt-6">
          <h1 className="mb-3 text-2xl font-bold md:text-3xl">{data.name}</h1>
          {data.description && <p className="text-text-lo">{data.description}</p>}
          <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('product.details')}</caption>
              <tbody>
                {geo && (
                  <tr className="border-b border-border">
                    <td className="px-3.5 py-3 text-text-lo">{t('product.attrGeo')}</td>
                    <td className="px-3.5 py-3 text-text">{geo}</td>
                  </tr>
                )}
                {kind && (
                  <tr className="border-b border-border">
                    <td className="px-3.5 py-3 text-text-lo">{t('product.attrKind')}</td>
                    <td className="px-3.5 py-3 text-text">
                      {t(`product.kinds.${kind}`, { defaultValue: kind })}
                    </td>
                  </tr>
                )}
                {variant && (
                  <tr className="border-b border-border">
                    <td className="px-3.5 py-3 text-text-lo">{t('product.attrDelivery')}</td>
                    <td className="px-3.5 py-3 text-text">
                      {variant.fulfillmentType === 'READY_STOCK'
                        ? t('product.instantDelivery')
                        : t('product.warmDelivery')}
                    </td>
                  </tr>
                )}
                {variant?.warrantyHours != null && (
                  <tr>
                    <td className="px-3.5 py-3 text-text-lo">{t('product.attrWarranty')}</td>
                    <td className="px-3.5 py-3 text-text">
                      {t('product.warranty', { hours: variant.warrantyHours })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <aside className="rounded-lg border border-border bg-surface p-6 lg:sticky lg:top-24">
        {variant && (
          <StockBadge
            fulfillmentTypes={[variant.fulfillmentType]}
            stockCount={variant.stockCount}
          />
        )}
        <h2 className="mb-1 mt-3.5 font-body text-lg font-bold text-text-hi">{data.name}</h2>
        <div className="text-sm text-text-lo">{t('product.chooseVariant')}</div>
        <div
          className="my-2.5 flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={t('product.chooseVariant')}
        >
          {data.variants.map((v) => (
            <button
              key={v.sku}
              type="button"
              role="radio"
              aria-checked={v.sku === variant?.sku}
              onClick={() => setSelectedSku(v.sku)}
              className={`rounded-md border px-3.5 py-2 text-[13.5px] font-semibold transition-all duration-[150ms] ${
                v.sku === variant?.sku
                  ? 'border-volt bg-volt/15 text-text-hi shadow-glow-volt'
                  : 'border-border-2 bg-surface-2 text-text hover:border-volt'
              }`}
            >
              {v.name}
            </button>
          ))}
        </div>

        {variant && (
          <>
            <div className="font-display text-[40px] font-extrabold text-text-hi tabular-nums">
              {formatMoney(variant.price, variant.currency)}
            </div>
            <div className="mb-4">
              <VariantAvailability variant={variant} />
            </div>

            <BuyNowButton variant={variant} />

            {variant.bundle.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="mb-2.5 font-body text-[13px] font-semibold uppercase tracking-[0.06em] text-text-hi">
                  {t('product.bundleHeading')}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {variant.bundle.map((component, index) => (
                    <li
                      key={`${component.type}-${index}`}
                      className="flex items-center gap-2.5 text-[13.5px] text-text-lo"
                    >
                      <Icon
                        name={BUNDLE_ICONS[component.type]}
                        className="!h-4 !w-4 text-success"
                      />
                      {component.type === 'WARRANTY' && typeof component.meta?.hours === 'number'
                        ? t('product.warranty', { hours: component.meta.hours })
                        : t(`product.bundle.${component.type}`)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2.5 border-t border-border pt-4 text-[13.5px] text-text-lo">
              <div className="flex items-center gap-2.5">
                <Icon name="check" className="!h-4 !w-4 text-success" />
                {variant.fulfillmentType === 'READY_STOCK'
                  ? t('product.instantDelivery')
                  : t('product.warmDelivery')}
              </div>
              <div className="flex items-center gap-2.5">
                <Icon name="check" className="!h-4 !w-4 text-success" />
                {t('product.payHint')}
              </div>
              <div className="flex items-center gap-2.5">
                <Icon name="check" className="!h-4 !w-4 text-success" />
                {t('product.supportHint')}
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
