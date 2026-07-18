import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useIsElevated } from '../../features/admin/api';
import {
  useAdminWarrantyClaim,
  useApproveClaim,
  useFulfillClaim,
  useRejectClaim,
} from '../../features/warranty/api';
import { WarrantyStatusPill } from '../../features/warranty/WarrantyStatusPill';
import { ApiRequestError } from '../../lib/api';

/** Warranty claim detail (E10): approve/reject (support) then fulfill (finance). */
export function AdminWarrantyDetailPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const claim = useAdminWarrantyClaim(id);
  const canFulfill = useIsElevated();

  const [note, setNote] = useState('');
  const [confirmFulfill, setConfirmFulfill] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = useApproveClaim(id);
  const reject = useRejectClaim(id);
  const fulfill = useFulfillClaim(id);
  const busy = approve.isPending || reject.isPending || fulfill.isPending;

  const onError = (e: unknown): void =>
    setError(e instanceof ApiRequestError ? e.message : t('admin.warranty.actionError'));

  if (claim.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-10 md:px-8">
        <div className="h-[320px] animate-pulse rounded-lg bg-surface" />
      </div>
    );
  }
  if (claim.isError || !claim.data) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-16 text-center md:px-8">
        <h1 className="mb-4 text-2xl font-bold">{t('admin.warranty.notFound')}</h1>
        <Link to="/admin/warranty" className="font-semibold text-volt-400 hover:text-text-hi">
          {t('admin.warranty.back')}
        </Link>
      </div>
    );
  }

  const c = claim.data;
  const isRequested = c.status === 'requested';
  const isApproved = c.status === 'approved';

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 border-t border-border py-2.5 text-sm">
      <span className="text-text-lo">{label}</span>
      <span className="text-right font-medium text-text-hi">{value}</span>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-8">
      <Link
        to="/admin/warranty"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-text-lo hover:text-text-hi"
      >
        <Icon name="arrow-left" className="!h-4 !w-4" /> {t('admin.warranty.back')}
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold">{c.number}</h1>
        <WarrantyStatusPill status={c.status} />
        <span className="inline-flex h-6 items-center rounded-pill bg-surface-2 px-2.5 text-xs font-semibold text-text-lo">
          {t(`warranty.types.${c.type}`)}
        </span>
      </div>

      <section className="mb-6 rounded-xl border border-border bg-surface px-5 py-2 shadow-2">
        {row(t('admin.warranty.colItem'), c.itemName)}
        {row(t('admin.warranty.sku'), c.sku)}
        {row(t('admin.warranty.colBuyer'), c.buyerEmail)}
        {row(t('admin.warranty.order'), c.orderNumber)}
        {row(t('admin.warranty.amount'), `${c.amount} ${c.currency}`)}
        {row(
          t('admin.warranty.window'),
          new Date(c.warrantyExpiresAt).toLocaleString(i18n.resolvedLanguage, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        )}
      </section>

      <section className="mb-6 rounded-xl border border-border bg-surface p-5 shadow-2">
        <h2 className="mb-2 text-sm font-semibold text-text-hi">{t('admin.warranty.reason')}</h2>
        <p className="whitespace-pre-wrap text-[14px] text-text-lo">{c.reason}</p>
        {c.resolutionNote && (
          <>
            <h2 className="mb-2 mt-4 text-sm font-semibold text-text-hi">
              {t('admin.warranty.resolutionNote')}
            </h2>
            <p className="whitespace-pre-wrap text-[14px] text-text-lo">{c.resolutionNote}</p>
          </>
        )}
        {c.replacementDeliveryId && (
          <p className="mt-3 text-[13px] text-success">{t('admin.warranty.replacementIssued')}</p>
        )}
      </section>

      {error && (
        <Banner tone="error" className="mb-4">
          {error}
        </Banner>
      )}

      {(isRequested || isApproved) && (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-2">
          <h2 className="mb-3 text-sm font-semibold text-text-hi">{t('admin.warranty.actions')}</h2>

          {(isRequested || isApproved) && (
            <>
              <label
                className="mb-1 block text-[13px] font-semibold text-text-lo"
                htmlFor="wc-note"
              >
                {t('admin.warranty.noteLabel')}
              </label>
              <textarea
                id="wc-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder={t('admin.warranty.notePlaceholder')}
                className="mb-3 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-hi outline-none focus:border-volt"
              />
            </>
          )}

          <div className="flex flex-wrap gap-2">
            {isRequested && (
              <Button
                variant="primary"
                loading={approve.isPending}
                disabled={busy}
                onClick={() => {
                  setError(null);
                  approve.mutate({ note: note.trim() || undefined }, { onError });
                }}
              >
                <Icon name="check" className="!h-4 !w-4" /> {t('admin.warranty.approve')}
              </Button>
            )}

            {(isRequested || isApproved) && (
              <Button
                variant="ghost"
                loading={reject.isPending}
                disabled={busy}
                onClick={() => {
                  setError(null);
                  reject.mutate({ note: note.trim() || undefined }, { onError });
                }}
              >
                <Icon name="x" className="!h-4 !w-4" /> {t('admin.warranty.reject')}
              </Button>
            )}

            {isApproved && canFulfill && !confirmFulfill && (
              <Button variant="secondary" disabled={busy} onClick={() => setConfirmFulfill(true)}>
                <Icon name="bolt" className="!h-4 !w-4" />{' '}
                {t(
                  c.type === 'refund'
                    ? 'admin.warranty.fulfillRefund'
                    : 'admin.warranty.fulfillReplace',
                )}
              </Button>
            )}
          </div>

          {isApproved && canFulfill && confirmFulfill && (
            <div className="mt-3 rounded-md border border-[rgba(255,77,109,0.4)] bg-[rgba(255,77,109,0.08)] p-3">
              <p className="mb-2 text-[13px] text-[#ffb3c1]">
                {t(
                  c.type === 'refund'
                    ? 'admin.warranty.confirmRefund'
                    : 'admin.warranty.confirmReplace',
                  { amount: c.amount, currency: c.currency },
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  loading={fulfill.isPending}
                  onClick={() => {
                    setError(null);
                    fulfill.mutate(undefined, {
                      onSuccess: () => setConfirmFulfill(false),
                      onError,
                    });
                  }}
                >
                  {t('admin.warranty.confirmYes')}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmFulfill(false)}>
                  {t('admin.cancel')}
                </Button>
              </div>
            </div>
          )}

          {isApproved && !canFulfill && (
            <p className="mt-3 text-[13px] text-text-dim">{t('admin.warranty.needFinance')}</p>
          )}
        </section>
      )}
    </div>
  );
}
