import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAdminWarrantyClaims } from '../../features/warranty/api';
import { WarrantyStatusPill } from '../../features/warranty/WarrantyStatusPill';
import type { WarrantyClaimStatus } from '@advault/types';

const STATUS_FILTERS: (WarrantyClaimStatus | 'all')[] = [
  'all',
  'requested',
  'approved',
  'replaced',
  'refunded',
  'rejected',
];

/** Warranty claim queue (E10): triage replace/refund requests from buyers. */
export function AdminWarrantyPage() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<WarrantyClaimStatus | 'all'>('all');
  const limit = 20;

  const claims = useAdminWarrantyClaims({
    page,
    status: status === 'all' ? undefined : status,
  });
  const totalPages = claims.data ? Math.max(1, Math.ceil(claims.data.meta.total / limit)) : 1;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-8">
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold">{t('admin.warranty.title')}</h1>
        <p className="text-sm text-text-lo">{t('admin.warranty.subtitle')}</p>
      </div>

      <div
        className="mb-5 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('admin.warranty.colStatus')}
      >
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            aria-pressed={status === s}
            className={`rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
              status === s
                ? 'bg-volt text-white'
                : 'border border-border bg-surface text-text-lo hover:text-text-hi'
            }`}
          >
            {s === 'all' ? t('admin.warranty.all') : t(`warranty.statuses.${s}`)}
          </button>
        ))}
      </div>

      {claims.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : claims.isError ? (
        <>
          <Banner tone="error">{t('admin.warranty.error')}</Banner>
          <Button variant="secondary" onClick={() => void claims.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : claims.data!.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="shield" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.warranty.empty')}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-semibold">{t('admin.warranty.colNumber')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.warranty.colItem')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.warranty.colType')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.warranty.colStatus')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.warranty.colBuyer')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.warranty.colCreated')}</th>
                </tr>
              </thead>
              <tbody>
                {claims.data!.data.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 transition-colors hover:bg-surface"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/warranty/${c.id}`}
                        className="font-display font-bold text-text-hi hover:text-volt-400"
                      >
                        {c.number}
                      </Link>
                    </td>
                    <td
                      className="max-w-[240px] truncate px-4 py-3 text-text-hi"
                      title={c.itemName}
                    >
                      {c.itemName}
                      <span className="ml-2 text-xs text-text-dim">· {c.orderNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-text-lo">{t(`warranty.types.${c.type}`)}</td>
                    <td className="px-4 py-3">
                      <WarrantyStatusPill status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-text-lo">{c.buyerEmail}</td>
                    <td className="px-4 py-3 text-text-dim">
                      {new Date(c.createdAt).toLocaleDateString(i18n.resolvedLanguage, {
                        dateStyle: 'medium',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav
              className="mt-5 flex items-center justify-center gap-3"
              aria-label={t('admin.pagination')}
            >
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="arrow-left" className="!h-3 !w-3" /> {t('admin.prev')}
              </Button>
              <span className="text-[13px] tabular-nums text-text-lo">
                {t('admin.page', { page, total: totalPages })}
              </span>
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('admin.next')} <Icon name="arrow-right" className="!h-3 !w-3" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
