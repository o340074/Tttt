import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { TextField } from '../../components/ui/TextField';
import { useAdminReferrals, useCancelReferral } from '../../features/referrals/api';
import type { ReferralStatus } from '@advault/types';

type StatusFilter = 'all' | ReferralStatus;
const FILTERS: StatusFilter[] = ['all', 'pending', 'qualified', 'cancelled'];

const STATUS_TONE: Record<ReferralStatus, string> = {
  pending: 'border-[rgba(245,183,64,0.4)] bg-[rgba(245,183,64,0.12)] text-[#ffd98a]',
  qualified: 'border-[rgba(43,217,166,0.4)] bg-[rgba(43,217,166,0.12)] text-success',
  cancelled: 'border-border bg-surface-2 text-text-dim',
};

/** Referral oversight queue (E12): programme totals + cancel abusive pendings. */
export function AdminReferralsPage() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const limit = 20;

  const status = filter === 'all' ? undefined : filter;
  const referrals = useAdminReferrals(page, status);
  const cancel = useCancelReferral();
  const totalPages = referrals.data ? Math.max(1, Math.ceil(referrals.data.meta.total / limit)) : 1;
  const summary = referrals.data?.summary;

  const submitCancel = (id: string): void => {
    if (!reason.trim()) return;
    cancel.mutate(
      { id, reason: reason.trim() },
      {
        onSuccess: () => {
          setCancelling(null);
          setReason('');
        },
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-8">
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold">{t('admin.referrals.title')}</h1>
        <p className="text-sm text-text-lo">{t('admin.referrals.subtitle')}</p>
      </div>

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label={t('admin.referrals.summary.pending')} value={String(summary.pending)} />
          <Tile label={t('admin.referrals.summary.qualified')} value={String(summary.qualified)} />
          <Tile label={t('admin.referrals.summary.cancelled')} value={String(summary.cancelled)} />
          <Tile
            label={t('admin.referrals.summary.rewardsPaid')}
            value={`$${summary.rewardsPaid}`}
            accent
          />
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
            aria-pressed={filter === f}
            className={`rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f
                ? 'bg-volt text-white'
                : 'border border-border bg-surface text-text-lo hover:text-text-hi'
            }`}
          >
            {t(`admin.referrals.filters.${f}`)}
          </button>
        ))}
      </div>

      {cancel.isError && (
        <Banner tone="error" className="mb-4">
          {t('admin.referrals.cancelError')}
        </Banner>
      )}

      {referrals.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : referrals.isError ? (
        <>
          <Banner tone="error">{t('admin.referrals.error')}</Banner>
          <Button variant="secondary" onClick={() => void referrals.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : referrals.data!.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="user" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.referrals.empty')}</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {referrals.data!.data.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-pill border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[r.status]}`}
                      >
                        {t(`referrals.status.${r.status}`)}
                      </span>
                      <span className="font-mono text-xs text-text-dim">{r.code}</span>
                    </div>
                    <div className="mt-1.5 text-sm text-text-hi">
                      {r.referrerEmail}
                      <Icon name="arrow-right" className="mx-1.5 !h-3 !w-3 text-text-dim" />
                      {r.refereeEmail}
                    </div>
                    <div className="mt-1 text-xs text-text-dim">
                      {new Date(r.createdAt).toLocaleDateString(i18n.resolvedLanguage, {
                        dateStyle: 'medium',
                      })}
                      {r.status === 'qualified' && (
                        <>
                          {' · '}
                          {t('admin.referrals.rewarded', {
                            referrer: r.referrerReward,
                            referee: r.refereeReward,
                          })}
                        </>
                      )}
                      {r.cancelledReason && ` · ${r.cancelledReason}`}
                    </div>
                  </div>
                  {r.status === 'pending' &&
                    (cancelling === r.id ? null : (
                      <Button
                        variant="secondary"
                        className="!h-8 !px-3 text-xs"
                        onClick={() => {
                          setCancelling(r.id);
                          setReason('');
                        }}
                      >
                        {t('admin.referrals.cancel')}
                      </Button>
                    ))}
                </div>

                {cancelling === r.id && (
                  <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
                    <TextField
                      id={`cancel-reason-${r.id}`}
                      label={t('admin.referrals.cancelReason')}
                      icon="pencil"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant="secondary"
                        className="!h-8 !px-3 text-xs"
                        disabled={!reason.trim()}
                        loading={cancel.isPending && cancel.variables?.id === r.id}
                        onClick={() => submitCancel(r.id)}
                      >
                        {t('admin.referrals.confirmCancel')}
                      </Button>
                      <Button
                        variant="ghost"
                        className="!h-8 !px-3 text-xs"
                        onClick={() => {
                          setCancelling(null);
                          setReason('');
                        }}
                      >
                        {t('admin.referrals.dismiss')}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

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

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-4 shadow-2">
      <div className={`font-mono text-2xl font-bold ${accent ? 'text-success' : 'text-text-hi'}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-dim">
        {label}
      </div>
    </div>
  );
}
