import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useWarmingJobs } from '../../features/admin/api';
import type { WarmingJobStatus, WarmingJobSummary } from '@advault/types';

/** Kanban columns in pipeline order; on_hold/failed sit at the end. */
const COLUMNS: WarmingJobStatus[] = [
  'queued',
  'assigned',
  'in_progress',
  'qc',
  'ready',
  'on_hold',
  'failed',
  'delivered',
];

const COLUMN_ACCENT: Record<WarmingJobStatus, string> = {
  queued: 'text-warning',
  assigned: 'text-volt-400',
  in_progress: 'text-beam',
  qc: 'text-beam',
  ready: 'text-success',
  on_hold: 'text-warning',
  failed: 'text-danger',
  delivered: 'text-success',
  refunded: 'text-danger',
};

/**
 * Warming Kanban (docs/13): every made-to-order job grouped by status. Cards
 * link to the operator workspace. One page of up to 100 jobs — enough for the
 * operator queue; deeper history lives behind the orders table.
 */
export function WarmingBoardPage() {
  const { t } = useTranslation();
  const jobs = useWarmingJobs({ page: 1, limit: 100 });

  const byStatus = new Map<WarmingJobStatus, WarmingJobSummary[]>();
  for (const status of COLUMNS) byStatus.set(status, []);
  for (const job of jobs.data?.data ?? []) {
    (byStatus.get(job.status) ?? byStatus.set(job.status, []).get(job.status)!).push(job);
  }

  return (
    <div className="flex h-full flex-col px-4 py-8 md:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t('admin.warming.title')}</h1>
          <p className="text-sm text-text-lo">{t('admin.warming.subtitle')}</p>
        </div>
        <Button variant="ghost" className="!h-9 !px-3 text-sm" onClick={() => void jobs.refetch()}>
          <Icon name="refresh" className="!h-4 !w-4" /> {t('admin.warming.refresh')}
        </Button>
      </div>

      {jobs.isLoading ? (
        <div className="flex gap-3" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-64 w-64 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : jobs.isError ? (
        <>
          <Banner tone="error">{t('admin.warming.error')}</Banner>
          <Button variant="secondary" onClick={() => void jobs.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : (jobs.data?.meta.total ?? 0) === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="spark" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.warming.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((status) => {
            const items = byStatus.get(status) ?? [];
            return (
              <section
                key={status}
                className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-surface/50"
                aria-label={t(`admin.warmStatuses.${status}`)}
              >
                <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <span
                    className={`text-xs font-bold uppercase tracking-wide ${COLUMN_ACCENT[status]}`}
                  >
                    {t(`admin.warmStatuses.${status}`)}
                  </span>
                  <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-text-lo">
                    {items.length}
                  </span>
                </header>
                <div className="flex flex-col gap-2 p-2">
                  {items.map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function JobCard({ job }: { job: WarmingJobSummary }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/admin/warming/${job.id}`}
      className="block rounded-lg border border-border bg-surface p-3 shadow-1 transition-all duration-[140ms] hover:-translate-y-px hover:border-volt"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-display text-[13px] font-bold text-text-hi">{job.orderNumber}</span>
        <span className="text-[11px] text-text-dim">{job.sku}</span>
      </div>
      <div className="mb-2 truncate text-xs text-text-lo">{job.name}</div>
      <div className="flex items-center justify-between text-[11px] text-text-dim">
        <span>
          {t('admin.warming.stage', { current: job.currentStage, total: job.stageCount })}
        </span>
        {job.etaAt && (
          <span>{new Date(job.etaAt).toLocaleDateString(undefined, { dateStyle: 'short' })}</span>
        )}
      </div>
      {job.assignedTo && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-volt-400">
          <Icon name="user" className="!h-3 !w-3" /> {t('admin.warming.assigned')}
        </div>
      )}
    </Link>
  );
}
