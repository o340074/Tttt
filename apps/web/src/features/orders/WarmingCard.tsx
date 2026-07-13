import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui/Icon';
import type { IconName } from '../../components/ui/Icon';
import type { OrderItem, WarmingJobStatus, WarmingTaskStatus } from '@advault/types';

/** Tone per buyer-facing warming status (docs/14). */
const STATUS_TONE: Record<WarmingJobStatus, string> = {
  queued: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  assigned: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  in_progress: 'bg-[rgba(34,211,238,0.14)] text-beam',
  qc: 'bg-[rgba(34,211,238,0.14)] text-beam',
  ready: 'bg-[rgba(43,217,166,0.14)] text-success',
  delivered: 'bg-[rgba(43,217,166,0.14)] text-success',
  on_hold: 'bg-[rgba(245,183,64,0.14)] text-warning',
  failed: 'bg-[rgba(245,183,64,0.14)] text-warning',
  refunded: 'bg-[rgba(255,77,109,0.14)] text-danger',
};

const STAGE_ICON: Record<WarmingTaskStatus, { name: IconName; className: string }> = {
  done: { name: 'check', className: 'text-success' },
  in_progress: { name: 'spark', className: 'text-beam' },
  blocked: { name: 'alert', className: 'text-warning' },
  skipped: { name: 'minus', className: 'text-text-dim' },
  pending: { name: 'clock', className: 'text-text-dim' },
};

/**
 * Buyer-facing warming progress for a MADE_TO_ORDER line (docs/14): status,
 * ETA, "stage k of N" with a progress bar, and the per-stage checklist.
 */
export function WarmingCard({ item }: { item: OrderItem }) {
  const { t, i18n } = useTranslation();
  const warming = item.warming;
  if (!warming) return null;

  const done = warming.stages.filter((s) => s.status === 'done').length;
  const pct =
    warming.status === 'delivered'
      ? 100
      : warming.totalStages > 0
        ? Math.round((done / warming.totalStages) * 100)
        : 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold text-text-hi">{item.name}</div>
          <div className="text-[12.5px] uppercase tracking-[0.04em] text-text-dim">{item.sku}</div>
        </div>
        <span
          className={`inline-flex h-6 items-center rounded-pill px-2.5 text-xs font-semibold ${STATUS_TONE[warming.status]}`}
        >
          {t(`warming.statuses.${warming.status}`)}
        </span>
      </div>

      {warming.etaAt && warming.status !== 'delivered' && warming.status !== 'refunded' && (
        <p className="mb-3 flex items-center gap-1.5 text-[13px] text-text-lo">
          <Icon name="clock" className="!h-4 !w-4 text-text-dim" />
          {t('warming.eta', {
            date: new Date(warming.etaAt).toLocaleString(i18n.resolvedLanguage, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </p>
      )}

      {warming.totalStages > 0 && (
        <>
          <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-text-lo">
            <span>
              {t('warming.stageOf', {
                current: Math.max(1, warming.currentStage),
                total: warming.totalStages,
              })}
            </span>
            <span className="tabular-nums text-text-dim">{pct}%</span>
          </div>
          <div
            className="mb-4 h-1.5 overflow-hidden rounded-pill bg-[rgba(124,125,250,0.14)]"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-pill bg-gradient-to-r from-volt-400 to-beam transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          <ol className="flex flex-col gap-1.5">
            {warming.stages.map((stage) => {
              const icon = STAGE_ICON[stage.status];
              return (
                <li key={stage.order} className="flex items-center gap-2 text-[13px]">
                  <Icon name={icon.name} className={`!h-4 !w-4 ${icon.className}`} />
                  <span
                    className={
                      stage.status === 'done'
                        ? 'text-text-lo line-through'
                        : stage.status === 'in_progress'
                          ? 'font-semibold text-text-hi'
                          : 'text-text-lo'
                    }
                  >
                    {stage.name}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
