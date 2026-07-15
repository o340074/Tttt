import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { ApiRequestError } from '../../lib/api';
import { useCreateWarrantyClaim } from './api';
import { WarrantyStatusPill } from './WarrantyStatusPill';
import type { OrderItem, WarrantyClaimType } from '@advault/types';

/**
 * Buyer warranty control for one delivered order line (E10). Shows the window,
 * an open claim's status, or the replace/refund request form while eligible.
 */
export function WarrantyControl({ item }: { item: OrderItem }) {
  const { t, i18n } = useTranslation();
  const [type, setType] = useState<WarrantyClaimType | null>(null);
  const [reason, setReason] = useState('');
  const create = useCreateWarrantyClaim();

  const warranty = item.warranty;
  if (!warranty || warranty.warrantyHours == null) return null;

  const expires = warranty.expiresAt
    ? new Date(warranty.expiresAt).toLocaleString(i18n.resolvedLanguage, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  // An open claim already exists — show its status and a link to the detail.
  if (warranty.activeClaim) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[13px] text-text-lo">
        <Icon name="shield" className="!h-4 !w-4 text-volt-400" />
        <span>{t('warranty.claimOpen', { number: warranty.activeClaim.number })}</span>
        <WarrantyStatusPill status={warranty.activeClaim.status} />
        <Link to="/warranty" className="font-semibold text-volt-400 hover:text-text-hi">
          {t('warranty.viewClaims')}
        </Link>
      </div>
    );
  }

  if (!warranty.eligible) {
    return (
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[12.5px] text-text-dim">
        <Icon name="shield" className="!h-4 !w-4" />
        {t('warranty.expired')}
      </div>
    );
  }

  const submit = (): void => {
    if (!type || reason.trim().length < 3) return;
    create.mutate(
      { orderItemId: item.id, type, reason: reason.trim() },
      {
        onSuccess: () => {
          setType(null);
          setReason('');
        },
      },
    );
  };

  const error =
    create.error instanceof ApiRequestError
      ? create.error.message
      : create.isError
        ? t('warranty.error')
        : null;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-text-lo">
        <Icon name="shield" className="!h-4 !w-4 text-success" />
        <span>{t('warranty.covered')}</span>
        {expires && <span className="text-text-dim">{t('warranty.until', { date: expires })}</span>}
      </div>

      {type === null ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="!h-9 !px-3 !text-[13px]"
            onClick={() => setType('replace')}
          >
            <Icon name="refresh" className="!h-4 !w-4" /> {t('warranty.requestReplace')}
          </Button>
          <Button
            variant="ghost"
            className="!h-9 !px-3 !text-[13px]"
            onClick={() => setType('refund')}
          >
            <Icon name="wallet" className="!h-4 !w-4" /> {t('warranty.requestRefund')}
          </Button>
        </div>
      ) : (
        <div className="fade-up flex flex-col gap-2">
          {error && <Banner tone="error">{error}</Banner>}
          <label
            className="text-[12.5px] font-semibold text-text-lo"
            htmlFor={`claim-reason-${item.id}`}
          >
            {t(type === 'replace' ? 'warranty.replaceReasonLabel' : 'warranty.refundReasonLabel')}
          </label>
          <textarea
            id={`claim-reason-${item.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t('warranty.reasonPlaceholder')}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[14px] text-text-hi outline-none focus:border-volt"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              className="!h-9 !px-3 !text-[13px]"
              loading={create.isPending}
              disabled={reason.trim().length < 3}
              onClick={submit}
            >
              {t('warranty.submit')}
            </Button>
            <Button
              variant="ghost"
              className="!h-9 !px-3 !text-[13px]"
              onClick={() => {
                setType(null);
                setReason('');
              }}
            >
              {t('warranty.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
