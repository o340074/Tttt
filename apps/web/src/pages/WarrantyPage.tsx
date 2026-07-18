import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { useMyWarrantyClaims } from '../features/warranty/api';
import { WarrantyStatusPill } from '../features/warranty/WarrantyStatusPill';

/** Buyer's warranty claims: replace/refund requests on delivered lines (E10). */
export function WarrantyPage() {
  const { t, i18n } = useTranslation();
  const claims = useMyWarrantyClaims();

  return (
    <div className="mx-auto w-full max-w-[840px] px-4 py-10 md:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold md:text-3xl">{t('warranty.title')}</h1>
        <p className="mt-1 text-sm text-text-lo">{t('warranty.subtitle')}</p>
      </div>

      {claims.isLoading ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : claims.isError ? (
        <>
          <Banner tone="error">{t('warranty.error')}</Banner>
          <Button variant="secondary" onClick={() => void claims.refetch()}>
            {t('warranty.retry')}
          </Button>
        </>
      ) : claims.data!.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="shield" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('warranty.empty')}</p>
          <Link
            to="/orders"
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-volt-400 hover:text-text-hi"
          >
            <Icon name="box" className="!h-4 !w-4" /> {t('warranty.toOrders')}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {claims.data!.data.map((claim) => (
            <li
              key={claim.id}
              className="rounded-lg border border-border bg-surface px-5 py-4 shadow-2"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2.5">
                <span className="font-display text-[15px] font-bold text-text-hi">
                  {claim.number}
                </span>
                <WarrantyStatusPill status={claim.status} />
                <span className="inline-flex h-6 items-center rounded-pill bg-surface-2 px-2.5 text-xs font-semibold text-text-lo">
                  {t(`warranty.types.${claim.type}`)}
                </span>
              </div>
              <div className="truncate text-[14px] text-text-hi" title={claim.itemName}>
                {claim.itemName}
              </div>
              <div className="text-[13px] text-text-lo">
                <Link to={`/orders/${claim.orderId}`} className="text-volt-400 hover:text-text-hi">
                  {claim.orderNumber}
                </Link>{' '}
                ·{' '}
                {new Date(claim.createdAt).toLocaleString(i18n.resolvedLanguage, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </div>
              {claim.resolutionNote && (
                <p className="mt-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-lo">
                  {claim.resolutionNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
