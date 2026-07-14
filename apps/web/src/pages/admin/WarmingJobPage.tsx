import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../features/auth/useAuth';
import {
  useAssignJob,
  useResolveJob,
  useSetAccount,
  useTransitionJob,
  useUpdateTask,
  useWarmingJob,
} from '../../features/admin/api';
import { WarmingStatusBadge } from '../../features/admin/badges';
import { JobInventoryPanel } from '../../features/admin/JobInventoryPanel';
import type { WarmingJobAction, WarmingJobStatus, WarmingTaskView } from '@advault/types';

/** Which non-money transitions an operator may drive from each status (mirrors the server table). */
const ACTIONS_BY_STATUS: Record<WarmingJobStatus, WarmingJobAction[]> = {
  queued: [],
  assigned: ['start', 'hold', 'fail'],
  in_progress: ['qc', 'hold', 'fail'],
  qc: ['ready', 'hold', 'fail'],
  ready: ['deliver'],
  on_hold: ['resume', 'fail'],
  failed: [],
  delivered: [],
  refunded: [],
};

/** Actions that are irreversible or money-touching → require a confirm. */
const DANGER_ACTIONS = new Set<WarmingJobAction>(['deliver', 'fail']);

/**
 * Operator workspace for one warming job (docs/12, docs/13): assign, drive the
 * stage checklist, capture the account, bind proxy/Octo (E7), and deliver the
 * bundle. Irreversible steps confirm first. No in-account automation — this is
 * logistics only (platform boundary, docs/09).
 */
export function WarmingJobPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const job = useWarmingJob(id);
  const assign = useAssignJob(id);
  const transition = useTransitionJob(id);

  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.warming.actionError'));
    }
  };

  if (job.isLoading) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-8 md:px-8">
        <div className="h-64 animate-pulse rounded-xl bg-surface" aria-hidden />
      </div>
    );
  }
  if (job.isError || !job.data) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-8 md:px-8">
        <Banner tone="error">{t('admin.warming.detailError')}</Banner>
        <Button variant="secondary" onClick={() => void job.refetch()}>
          {t('admin.retry')}
        </Button>
      </div>
    );
  }

  const d = job.data;
  const actions = ACTIONS_BY_STATUS[d.status];

  const doTransition = (action: WarmingJobAction) => {
    if (DANGER_ACTIONS.has(action) && !window.confirm(t(`admin.warming.confirm.${action}`))) return;
    void run(() => transition.mutateAsync({ action }));
  };

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-8 md:px-8">
      <Link
        to="/admin/warming"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-text-lo hover:text-text-hi"
      >
        <Icon name="arrow-left" className="!h-3.5 !w-3.5" /> {t('admin.warming.back')}
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-text-hi">{d.orderNumber}</h1>
            <WarmingStatusBadge status={d.status} />
          </div>
          <p className="mt-1 text-sm text-text-lo">
            {d.name} · {d.sku}
            {d.goal ? ` · ${d.goal}` : ''}
          </p>
        </div>
        {d.etaAt && (
          <div className="text-right text-sm">
            <div className="text-text-dim">{t('admin.warming.eta')}</div>
            <div className="font-semibold text-text-hi">
              {new Date(d.etaAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </div>
          </div>
        )}
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {/* Actions bar */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4">
        {d.status === 'queued' && (
          <Button
            className="!h-10"
            loading={assign.isPending}
            onClick={() => user && void run(() => assign.mutateAsync(user.id))}
          >
            <Icon name="user" className="!h-4 !w-4" /> {t('admin.warming.assignMe')}
          </Button>
        )}
        {actions.map((action) => (
          <Button
            key={action}
            variant={action === 'deliver' ? 'primary' : action === 'fail' ? 'ghost' : 'secondary'}
            className="!h-10"
            loading={transition.isPending}
            onClick={() => doTransition(action)}
          >
            {t(`admin.warming.actions.${action}`)}
          </Button>
        ))}
        {d.status === 'failed' && <ResolvePanel jobId={id} onError={setError} />}
        {actions.length === 0 && d.status !== 'queued' && d.status !== 'failed' && (
          <span className="text-sm text-text-dim">{t('admin.warming.terminal')}</span>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Tasks checklist */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-dim">
            {t('admin.warming.stages')}
          </h2>
          <div className="flex flex-col gap-2">
            {d.tasks.map((task) => (
              <TaskRow key={task.id} jobId={id} task={task} onError={setError} />
            ))}
          </div>
        </section>

        {/* Account + inventory */}
        <div className="flex flex-col gap-6">
          <AccountPanel jobId={id} captured={d.hasAccountAsset} onError={setError} />
          <JobInventoryPanel jobId={id} onError={setError} />
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  jobId,
  task,
  onError,
}: {
  jobId: string;
  task: WarmingTaskView;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateTask(jobId);
  const done = task.status === 'done';

  const toggle = async () => {
    try {
      await update.mutateAsync({ taskId: task.id, status: done ? 'pending' : 'done' });
    } catch (e) {
      onError(e instanceof Error ? e.message : t('admin.warming.actionError'));
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={update.isPending}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-border-2 disabled:opacity-60"
    >
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
          done ? 'border-success bg-success text-void' : 'border-border-2 text-transparent'
        }`}
        aria-hidden
      >
        <Icon name="check" className="!h-3 !w-3" />
      </span>
      <span className="flex-1">
        <span className={`text-sm ${done ? 'text-text-lo line-through' : 'text-text-hi'}`}>
          {task.name}
        </span>
        <span className="ml-2 text-xs text-text-dim">
          {t('admin.warming.expectedMin', { min: task.expectedMinutes })}
        </span>
      </span>
      <span className="text-xs text-text-dim">{t(`admin.taskStatuses.${task.status}`)}</span>
    </button>
  );
}

function AccountPanel({
  jobId,
  captured,
  onError,
}: {
  jobId: string;
  captured: boolean;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const setAccount = useSetAccount(jobId);
  const [payload, setPayload] = useState('');
  const [recovery, setRecovery] = useState('');
  const [open, setOpen] = useState(false);

  const submit = async () => {
    try {
      await setAccount.mutateAsync({ payload, recovery: recovery || undefined });
      setPayload('');
      setRecovery('');
      setOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : t('admin.warming.actionError'));
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-dim">
          {t('admin.warming.account')}
        </h2>
        {captured && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
            <Icon name="lock" className="!h-3.5 !w-3.5" /> {t('admin.warming.accountCaptured')}
          </span>
        )}
      </div>

      {!open ? (
        <Button variant="secondary" className="!h-9 text-sm" onClick={() => setOpen(true)}>
          {captured ? t('admin.warming.accountReplace') : t('admin.warming.accountAdd')}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={3}
            placeholder={t('admin.warming.accountPayloadPh')}
            className="w-full rounded-md border border-border bg-void px-3 py-2 font-mono text-xs text-text-hi outline-none focus:border-volt"
          />
          <input
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
            placeholder={t('admin.warming.accountRecoveryPh')}
            className="w-full rounded-md border border-border bg-void px-3 py-2 font-mono text-xs text-text-hi outline-none focus:border-volt"
          />
          <p className="text-[11px] text-text-dim">{t('admin.warming.accountHint')}</p>
          <div className="flex gap-2">
            <Button
              className="!h-9 text-sm"
              loading={setAccount.isPending}
              disabled={!payload.trim()}
              onClick={() => void submit()}
            >
              {t('admin.warming.save')}
            </Button>
            <Button variant="ghost" className="!h-9 text-sm" onClick={() => setOpen(false)}>
              {t('admin.cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ResolvePanel({ jobId, onError }: { jobId: string; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const resolve = useResolveJob(jobId);

  const doResolve = async (resolution: 'reassign' | 'refund') => {
    if (!window.confirm(t(`admin.warming.confirm.${resolution}`))) return;
    try {
      await resolve.mutateAsync({ resolution });
    } catch (e) {
      onError(e instanceof Error ? e.message : t('admin.warming.actionError'));
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        className="!h-10"
        loading={resolve.isPending}
        onClick={() => void doResolve('reassign')}
      >
        {t('admin.warming.actions.reassign')}
      </Button>
      <Button
        variant="ghost"
        className="!h-10"
        loading={resolve.isPending}
        onClick={() => void doResolve('refund')}
      >
        {t('admin.warming.actions.refund')}
      </Button>
    </>
  );
}
