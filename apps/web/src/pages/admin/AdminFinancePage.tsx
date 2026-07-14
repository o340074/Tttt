import { useTranslation } from 'react-i18next';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useFinanceSummary } from '../../features/admin/api';
import { formatMoney } from '../../features/catalog/format';
import type { FinanceSummary } from '@advault/types';

/** Finance reconciliation + money totals (docs/13 §11). Manager/admin only. */
export function AdminFinancePage() {
  const { t } = useTranslation();
  const summary = useFinanceSummary();

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-8">
      <h1 className="mb-1 text-2xl font-bold">{t('admin.finance.title')}</h1>
      <p className="mb-6 text-sm text-text-lo">{t('admin.finance.subtitle')}</p>

      {summary.isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface" aria-hidden />
      ) : summary.isError ? (
        <>
          <Banner tone="error">{t('admin.finance.error')}</Banner>
          <Button variant="secondary" onClick={() => void summary.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : (
        <FinanceView data={summary.data!} />
      )}
    </div>
  );
}

function FinanceView({ data }: { data: FinanceSummary }) {
  const { t } = useTranslation();
  const ok = data.reconciled;
  return (
    <div className="flex flex-col gap-6">
      <div
        className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5 ${
          ok
            ? 'border-success/40 bg-[rgba(43,217,166,0.06)]'
            : 'border-danger/40 bg-[rgba(255,77,109,0.06)]'
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon
            name={ok ? 'check' : 'alert'}
            className={`!h-6 !w-6 ${ok ? 'text-success' : 'text-danger'}`}
          />
          <div>
            <div className="font-display text-lg font-bold text-text-hi">
              {ok ? t('admin.finance.reconciled') : t('admin.finance.discrepancy')}
            </div>
            <div className="text-xs text-text-dim">{t('admin.finance.reconHint')}</div>
          </div>
        </div>
        <div className="flex gap-8">
          <Figure
            label={t('admin.finance.ledgerBalance')}
            value={formatMoney(data.ledgerBalance, data.currency)}
          />
          <Figure
            label={t('admin.finance.cachedBalance')}
            value={formatMoney(data.cachedBalance, data.currency)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile
          label={t('admin.finance.topUps')}
          value={formatMoney(data.topUps, data.currency)}
          tone="up"
        />
        <Tile
          label={t('admin.finance.orderSpend')}
          value={formatMoney(data.orderSpend, data.currency)}
        />
        <Tile
          label={t('admin.finance.refunds')}
          value={formatMoney(data.refunds, data.currency)}
          tone="down"
        />
        <Tile
          label={t('admin.finance.adjustments')}
          value={formatMoney(data.adjustments, data.currency)}
        />
        <Tile label={t('admin.finance.orders')} value={String(data.orderCount)} />
        <Tile label={t('admin.finance.refundCount')} value={String(data.refundCount)} />
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[11px] uppercase tracking-wide text-text-dim">{label}</div>
      <div className="font-display text-lg font-bold tabular-nums text-text-hi">{value}</div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  const color = tone === 'up' ? 'text-success' : tone === 'down' ? 'text-danger' : 'text-text-hi';
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-text-dim">{label}</div>
      <div className={`mt-1 font-display text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
