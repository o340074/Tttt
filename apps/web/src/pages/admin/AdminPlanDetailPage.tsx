import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useUpdatePlan, useWarmingPlan } from '../../features/admin/api';
import { StageEditor } from '../../features/admin/StageEditor';
import { totalEta } from '../../features/admin/stageUtils';
import type { AdminWarmingPlanDetail, WarmingStageInput } from '@advault/types';

const fieldClass =
  'h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt';
const labelClass = 'mb-1 block text-xs font-semibold text-text-lo';

/** Warming plan detail: edit metadata + versioned stage editor (docs/13 §6). */
export function AdminPlanDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const plan = useWarmingPlan(id);
  const update = useUpdatePlan(id!);
  const [error, setError] = useState<string | null>(null);

  if (plan.isLoading) {
    return (
      <div className="mx-auto max-w-[900px] p-8" aria-hidden>
        <div className="h-40 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }
  if (plan.isError || !plan.data) {
    return (
      <div className="mx-auto max-w-[900px] p-8">
        <Banner tone="error">{t('admin.plans.notFound')}</Banner>
        <Link to="/admin/plans" className="text-sm text-volt-400">
          {t('admin.plans.backToList')}
        </Link>
      </div>
    );
  }
  const p = plan.data;

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-8 md:px-8">
      <Link
        to="/admin/plans"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-lo hover:text-text-hi"
      >
        <Icon name="arrow-left" className="!h-3.5 !w-3.5" /> {t('admin.plans.backToList')}
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold">{p.name}</h1>
            <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-lo">
              {t('admin.plans.version', { version: p.version })}
            </span>
            {!p.isActive && (
              <span className="rounded-pill bg-[rgba(245,183,64,0.14)] px-2 py-0.5 text-xs text-warning">
                {t('admin.plans.archived')}
              </span>
            )}
          </div>
          <p className="text-sm text-text-dim">
            {p.goal}
            {p.tier ? ` · ${p.tier}` : ''} ·{' '}
            {t('admin.plans.linkedVariants', { count: p.variantCount })}
          </p>
        </div>
        <Button
          variant={p.isActive ? 'ghost' : 'secondary'}
          onClick={() =>
            update.mutate(
              { isActive: !p.isActive },
              { onError: () => setError(t('admin.plans.saveError')) },
            )
          }
        >
          {p.isActive ? t('admin.plans.archive') : t('admin.plans.restore')}
        </Button>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      <MetadataForm plan={p} />
      <StagesForm plan={p} />
    </div>
  );
}

function MetadataForm({ plan }: { plan: AdminWarmingPlanDetail }) {
  const { t } = useTranslation();
  const update = useUpdatePlan(plan.id);
  const [name, setName] = useState(plan.name);
  const [goal, setGoal] = useState(plan.goal);
  const [tier, setTier] = useState(plan.tier ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    update.mutate(
      { name: name.trim(), goal: goal.trim(), tier: tier.trim() || null },
      { onError: () => setError(t('admin.plans.saveError')) },
    );
  };

  return (
    <form onSubmit={submit} className="mb-6 rounded-xl border border-border bg-surface p-5">
      {error && <Banner tone="error">{error}</Banner>}
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className={labelClass}>{t('admin.plans.name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.plans.goal')}</span>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} className={fieldClass} />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.plans.tier')}</span>
          <input value={tier} onChange={(e) => setTier(e.target.value)} className={fieldClass} />
        </label>
      </div>
      <div className="mt-4">
        <Button type="submit" loading={update.isPending}>
          {t('admin.plans.save')}
        </Button>
      </div>
    </form>
  );
}

function StagesForm({ plan }: { plan: AdminWarmingPlanDetail }) {
  const { t } = useTranslation();
  const update = useUpdatePlan(plan.id);
  const [stages, setStages] = useState<WarmingStageInput[]>(
    plan.stages.map((s) => ({
      name: s.name,
      expectedMinutes: s.expectedMinutes,
      checklist: s.checklist,
      requiredComponents: s.requiredComponents,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    update.mutate(
      { stages: stages.map((s) => ({ ...s, expectedMinutes: Number(s.expectedMinutes) || 1 })) },
      { onError: () => setError(t('admin.plans.saveError')) },
    );
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('admin.plans.stages')}</h2>
        <span className="text-sm text-text-lo">
          {t('admin.plans.etaValue', { count: totalEta(stages) })}
        </span>
      </div>
      <p className="mb-4 text-[11px] text-text-dim">{t('admin.plans.versionHint')}</p>
      {error && <Banner tone="error">{error}</Banner>}
      <StageEditor value={stages} onChange={setStages} />
      <div className="mt-4">
        <Button type="submit" loading={update.isPending} disabled={stages.length === 0}>
          {t('admin.plans.saveStages')}
        </Button>
      </div>
    </form>
  );
}
