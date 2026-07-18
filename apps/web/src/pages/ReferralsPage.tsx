import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { useMyReferral } from '../features/referrals/api';
import type { ReferralStatus } from '@advault/types';

const STATUS_TONE: Record<ReferralStatus, string> = {
  pending: 'border-[rgba(245,183,64,0.4)] bg-[rgba(245,183,64,0.12)] text-[#ffd98a]',
  qualified: 'border-[rgba(43,217,166,0.4)] bg-[rgba(43,217,166,0.12)] text-success',
  cancelled: 'border-border bg-surface-2 text-text-dim',
};

/** Buyer referral programme (E12): share your code, track invites and rewards. */
export function ReferralsPage() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, refetch } = useMyReferral();
  const [copied, setCopied] = useState(false);

  const copyLink = async (): Promise<void> => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — the link is visible to copy manually.
    }
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 md:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/account"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-text-lo hover:text-text-hi"
        >
          <Icon name="arrow-left" className="text-[12px]" /> {t('referrals.back')}
        </Link>
      </div>

      <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t('referrals.title')}</h1>
      <p className="mb-6 text-sm text-text-lo">{t('referrals.subtitle')}</p>

      {isLoading ? (
        <div className="space-y-3" aria-hidden>
          <div className="h-32 animate-pulse rounded-xl bg-surface" />
          <div className="h-20 animate-pulse rounded-xl bg-surface" />
        </div>
      ) : isError || !data ? (
        <>
          <Banner tone="error">{t('referrals.error')}</Banner>
          <Button variant="secondary" onClick={() => void refetch()}>
            {t('referrals.retry')}
          </Button>
        </>
      ) : (
        <>
          {!data.enabled && (
            <Banner tone="info" className="mb-5">
              {t('referrals.disabled')}
            </Banner>
          )}

          {/* Invite card */}
          <section className="mb-5 rounded-xl border border-border bg-surface p-6 shadow-2">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.08em] text-text-dim">
              {t('referrals.yourCode')}
            </h2>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="font-mono text-2xl font-bold tracking-[0.12em] text-volt-400">
                {data.code}
              </span>
            </div>
            <label
              htmlFor="referral-link"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-text-dim"
            >
              {t('referrals.inviteLink')}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="referral-link"
                readOnly
                value={data.link}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[13px] text-text-hi"
              />
              <Button variant="secondary" onClick={() => void copyLink()}>
                <Icon name={copied ? 'check' : 'copy'} className="text-[13px]" />
                {copied ? t('referrals.copied') : t('referrals.copy')}
              </Button>
            </div>
            <p className="mt-3 text-[12.5px] text-text-dim">
              {t('referrals.terms', {
                referrer: data.terms.referrerReward,
                referee: data.terms.refereeReward,
                min: data.terms.minPurchase,
              })}
            </p>
          </section>

          {/* Stats */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            <Stat label={t('referrals.stats.invited')} value={String(data.stats.total)} />
            <Stat label={t('referrals.stats.qualified')} value={String(data.stats.qualified)} />
            <Stat label={t('referrals.stats.earned')} value={`$${data.stats.earned}`} accent />
          </div>

          {/* Referral list */}
          <section className="rounded-xl border border-border bg-surface p-6 shadow-2">
            <h2 className="mb-4 text-lg font-semibold">{t('referrals.listTitle')}</h2>
            {data.referrals.length === 0 ? (
              <div className="py-8 text-center">
                <Icon name="user" className="mb-3 !h-9 !w-9 opacity-70" />
                <p className="text-sm text-text-lo">{t('referrals.empty')}</p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {data.referrals.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text-hi">
                        {r.refereeMasked}
                      </div>
                      <div className="text-xs text-text-dim">
                        {new Date(r.createdAt).toLocaleDateString(i18n.resolvedLanguage, {
                          dateStyle: 'medium',
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.status === 'qualified' && (
                        <span className="font-mono text-sm font-semibold text-success">
                          +${r.reward}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center rounded-pill border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[r.status]}`}
                      >
                        {t(`referrals.status.${r.status}`)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-4 text-center shadow-2">
      <div
        className={`font-mono text-xl font-bold ${accent ? 'text-success' : 'text-text-hi'}`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-dim">
        {label}
      </div>
    </div>
  );
}
