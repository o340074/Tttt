import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useCreatePlan, useWarmingPlans } from '../../features/admin/api';
import { StageEditor } from '../../features/admin/StageEditor';
import { totalEta } from '../../features/admin/stageUtils';
import type { WarmingStageInput } from '@advault/types';

const fieldClass =
  'h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt';
const labelClass = 'mb-1 block text-xs font-semibold text-text-lo';

/** Warming plans list + create (docs/13 §6). Manager+. */
export function AdminPlansPage() {
  const { t } = useTranslation();
  const plans = useWarmingPlans();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t('admin.plans.title')}</h1>
          <p className="text-sm text-text-lo">{t('admin.plans.subtitle')}</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Icon name={showForm ? 'x' : 'plus'} className="!h-4 !w-4" /> {t('admin.plans.newPlan')}
        </Button>
      </div>

      {showForm && <PlanForm onDone={() => setShowForm(false)} />}

      {plans.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : plans.isError ? (
        <>
          <Banner tone="error">{t('admin.plans.error')}</Banner>
          <Button variant="secondary" onClick={() => void plans.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : plans.data!.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="clock" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.plans.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="px-4 py-3 font-semibold">{t('admin.plans.colName')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin.plans.colGoal')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin.plans.colTier')}</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t('admin.plans.colVersion')}
                </th>
                <th className="px-4 py-3 text-right font-semibold">{t('admin.plans.colStages')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('admin.plans.colEta')}</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t('admin.plans.colVariants')}
                </th>
                <th className="px-4 py-3 font-semibold">{t('admin.plans.colActive')}</th>
              </tr>
            </thead>
            <tbody>
              {plans.data!.map((pl) => (
                <tr
                  key={pl.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/plans/${pl.id}`}
                      className="font-medium text-text-hi hover:text-volt-400"
                    >
                      {pl.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-lo">{pl.goal}</td>
                  <td className="px-4 py-3 text-text-lo">{pl.tier ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-lo">v{pl.version}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-lo">
                    {pl.stageCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-hi">
                    {t('admin.plans.etaValue', { count: pl.etaMinutes })}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-lo">
                    {pl.variantCount}
                  </td>
                  <td className="px-4 py-3">
                    {pl.isActive ? (
                      <Icon name="check" className="!h-4 !w-4 text-success" />
                    ) : (
                      <span className="text-xs text-text-dim">{t('admin.plans.archived')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlanForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreatePlan();
  const [goal, setGoal] = useState('');
  const [tier, setTier] = useState('');
  const [name, setName] = useState('');
  const [stages, setStages] = useState<WarmingStageInput[]>([
    { name: '', expectedMinutes: 60, checklist: [], requiredComponents: [] },
  ]);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate(
      {
        goal: goal.trim(),
        tier: tier.trim() || null,
        name: name.trim(),
        stages: stages.map((s) => ({ ...s, expectedMinutes: Number(s.expectedMinutes) || 1 })),
      },
      { onSuccess: onDone, onError: () => setError(t('admin.plans.saveError')) },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="mb-6 rounded-xl border border-border bg-surface p-5"
      aria-label={t('admin.plans.newPlan')}
    >
      {error && <Banner tone="error">{error}</Banner>}
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className={labelClass}>{t('admin.plans.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.plans.goal')}</span>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            required
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.plans.tier')}</span>
          <input value={tier} onChange={(e) => setTier(e.target.value)} className={fieldClass} />
        </label>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-text-hi">{t('admin.plans.stages')}</span>
        <span className="text-sm text-text-lo">
          {t('admin.plans.etaValue', { count: totalEta(stages) })}
        </span>
      </div>
      <StageEditor value={stages} onChange={setStages} />
      <div className="mt-4 flex gap-3">
        <Button type="submit" loading={create.isPending} disabled={stages.length === 0}>
          {t('admin.plans.create')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('admin.plans.cancel')}
        </Button>
      </div>
    </form>
  );
}
