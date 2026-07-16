import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import {
  useDashboard,
  useFulfillmentReport,
  useOperatorLoad,
  useSalesReport,
  type ReportPeriod,
} from '../../features/admin/api';
import { formatMoney } from '../../features/catalog/format';
import type { SalesByDimensionRow } from '@advault/types';

/** Preset periods (days back from now) for the reports filter. */
const PRESETS = [7, 30, 90] as const;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Dashboard + reports (docs/13 §1, §14): live operational KPIs plus period-bound
 * aggregates — sales by category/goal, plan-vs-actual/SLA, operator load,
 * top products. Read-only; manager+ (gated in the nav + enforced by the API).
 */
export function AdminDashboardPage() {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(30);
  const period: ReportPeriod = { from: daysAgo(days) };

  const dash = useDashboard(period);
  const sales = useSalesReport(period);
  const fulfil = useFulfillmentReport(period);
  const ops = useOperatorLoad(period);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t('admin.dashboard.title')}</h1>
          <p className="text-sm text-text-lo">{t('admin.dashboard.subtitle')}</p>
        </div>
        <div
          className="flex items-center gap-2"
          role="group"
          aria-label={t('admin.dashboard.period')}
        >
          {PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
                days === d
                  ? 'bg-volt text-white'
                  : 'border border-border bg-surface text-text-lo hover:text-text-hi'
              }`}
            >
              {t('admin.dashboard.lastDays', { days: d })}
            </button>
          ))}
        </div>
      </div>

      {dash.isError ? (
        <Banner tone="error" className="mb-4">
          {t('admin.dashboard.error')}
          <Button variant="secondary" className="ml-3 !h-8" onClick={() => void dash.refetch()}>
            {t('admin.retry')}
          </Button>
        </Banner>
      ) : (
        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            label={t('admin.dashboard.revenue')}
            loading={dash.isLoading}
            value={dash.data ? formatMoney(dash.data.revenue, dash.data.currency) : '—'}
          />
          <Kpi
            label={t('admin.dashboard.orders')}
            loading={dash.isLoading}
            value={dash.data ? String(dash.data.orders) : '—'}
          />
          <Kpi
            label={t('admin.dashboard.avgOrder')}
            loading={dash.isLoading}
            value={dash.data ? formatMoney(dash.data.avgOrder, dash.data.currency) : '—'}
          />
          <Kpi
            label={t('admin.dashboard.refunds')}
            loading={dash.isLoading}
            value={dash.data ? formatMoney(dash.data.refunds, dash.data.currency) : '—'}
            tone="danger"
          />
        </section>
      )}

      {dash.data && (
        <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <OpsTile
            icon="clock"
            label={t('admin.dashboard.warmingQueued')}
            value={dash.data.ops.warmingQueued}
          />
          <OpsTile
            icon="spark"
            label={t('admin.dashboard.warmingInProgress')}
            value={dash.data.ops.warmingInProgress}
          />
          <OpsTile
            icon="eye"
            label={t('admin.dashboard.warmingQc')}
            value={dash.data.ops.warmingQc}
          />
          <OpsTile
            icon="check"
            label={t('admin.dashboard.warmingReady')}
            value={dash.data.ops.warmingReady}
          />
          <OpsTile
            icon="alert"
            label={t('admin.dashboard.warmingOverdue')}
            value={dash.data.ops.warmingOverdue}
            tone="danger"
          />
          <OpsTile
            icon="mail"
            label={t('admin.dashboard.openTickets')}
            value={dash.data.ops.openTickets}
          />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t('admin.reports.byCategory')}>
          <DimensionTable
            rows={sales.data?.byCategory}
            loading={sales.isLoading}
            currency={sales.data?.currency ?? 'USD'}
          />
        </Panel>
        <Panel title={t('admin.reports.byGoal')}>
          <DimensionTable
            rows={sales.data?.byGoal}
            loading={sales.isLoading}
            currency={sales.data?.currency ?? 'USD'}
            labelKeyPrefix="admin.goals"
          />
        </Panel>
        <Panel title={t('admin.reports.topProducts')}>
          <DimensionTable
            rows={sales.data?.topProducts}
            loading={sales.isLoading}
            currency={sales.data?.currency ?? 'USD'}
          />
        </Panel>
        <Panel title={t('admin.reports.fulfillment')}>
          {fulfil.isLoading ? (
            <Skeleton />
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Metric
                label={t('admin.reports.deliveredJobs')}
                value={String(fulfil.data?.deliveredJobs ?? 0)}
              />
              <Metric
                label={t('admin.reports.slaMet')}
                value={`${fulfil.data?.slaMetPercent ?? 0}%`}
              />
              <Metric
                label={t('admin.reports.avgPlan')}
                value={t('admin.reports.minutes', { n: fulfil.data?.avgPlanMinutes ?? 0 })}
              />
              <Metric
                label={t('admin.reports.avgActual')}
                value={t('admin.reports.minutes', { n: fulfil.data?.avgActualMinutes ?? 0 })}
              />
              <Metric
                label={t('admin.reports.refundRate')}
                value={`${fulfil.data?.refundReplaceRate ?? 0}%`}
              />
            </dl>
          )}
        </Panel>
      </div>

      <Panel title={t('admin.reports.operatorLoad')} className="mt-6">
        {ops.isLoading ? (
          <Skeleton />
        ) : (ops.data?.operators.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-text-dim">{t('admin.reports.noOperators')}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="py-2 font-semibold">{t('admin.reports.operator')}</th>
                <th className="py-2 text-right font-semibold">{t('admin.reports.active')}</th>
                <th className="py-2 text-right font-semibold">{t('admin.reports.delivered')}</th>
              </tr>
            </thead>
            <tbody>
              {ops.data!.operators.map((o) => (
                <tr key={o.operatorId} className="border-b border-border last:border-0">
                  <td className="py-2 text-text-hi">{o.email}</td>
                  <td className="py-2 text-right tabular-nums text-text-lo">{o.active}</td>
                  <td className="py-2 text-right tabular-nums text-text-lo">{o.delivered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function Kpi({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value: string;
  loading?: boolean;
  tone?: 'danger';
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-text-dim">{label}</div>
      {loading ? (
        <div className="mt-2 h-7 w-20 animate-pulse rounded bg-surface-2" aria-hidden />
      ) : (
        <div
          className={`mt-1 font-display text-2xl font-bold tabular-nums ${tone === 'danger' ? 'text-danger' : 'text-text-hi'}`}
        >
          {value}
        </div>
      )}
    </div>
  );
}

function OpsTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: 'clock' | 'spark' | 'eye' | 'check' | 'alert' | 'mail';
  label: string;
  value: number;
  tone?: 'danger';
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <Icon
        name={icon}
        className={`mb-1 !h-4 !w-4 ${tone === 'danger' && value > 0 ? 'text-danger' : 'text-text-dim'}`}
      />
      <div
        className={`font-display text-xl font-bold tabular-nums ${tone === 'danger' && value > 0 ? 'text-danger' : 'text-text-hi'}`}
      >
        {value}
      </div>
      <div className="text-[11px] leading-tight text-text-dim">{label}</div>
    </div>
  );
}

function Panel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-5 ${className}`}>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-dim">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-dim">{label}</dt>
      <dd className="font-display text-lg font-bold tabular-nums text-text-hi">{value}</dd>
    </div>
  );
}

function Skeleton() {
  return <div className="h-24 animate-pulse rounded-lg bg-surface-2" aria-hidden />;
}

function DimensionTable({
  rows,
  loading,
  currency,
  labelKeyPrefix,
}: {
  rows?: SalesByDimensionRow[];
  loading?: boolean;
  currency: string;
  labelKeyPrefix?: string;
}) {
  const { t } = useTranslation();
  if (loading) return <Skeleton />;
  if (!rows || rows.length === 0)
    return <p className="py-6 text-center text-sm text-text-dim">{t('admin.reports.noData')}</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {rows.map((r) => {
          const label = labelKeyPrefix
            ? t(`${labelKeyPrefix}.${r.label}`, { defaultValue: r.label })
            : r.label;
          return (
            <tr key={r.key} className="border-b border-border last:border-0">
              <td className="py-2 pr-2 text-text-hi">{label}</td>
              <td className="py-2 px-2 text-right tabular-nums text-text-dim">{r.orders}</td>
              <td className="py-2 pl-2 text-right font-semibold tabular-nums text-text-hi">
                {formatMoney(r.revenue, currency)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
