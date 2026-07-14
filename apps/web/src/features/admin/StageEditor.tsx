import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import type { BundleComponentType, WarmingStageInput } from '@advault/types';

const COMPONENT_TYPES: BundleComponentType[] = [
  'ACCOUNT',
  'PROXY',
  'OCTO_PROFILE',
  'RECOVERY',
  'SECRETS',
  'GUIDE',
  'WARRANTY',
];

/** Reusable ordered-stage editor used by plan create + detail (docs/13 §6). */
export function StageEditor({
  value,
  onChange,
}: {
  value: WarmingStageInput[];
  onChange: (s: WarmingStageInput[]) => void;
}) {
  const { t } = useTranslation();

  const patch = (i: number, partial: Partial<WarmingStageInput>) =>
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...partial } : s)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([...value, { name: '', expectedMinutes: 60, checklist: [], requiredComponents: [] }]);

  const toggleComponent = (i: number, tp: BundleComponentType, on: boolean) => {
    const current = value[i]!.requiredComponents ?? [];
    patch(i, {
      requiredComponents: on ? [...current, tp] : current.filter((c) => c !== tp),
    });
  };

  const metaInput =
    'h-9 rounded-md border border-border bg-surface-2 px-2 text-xs text-text-hi outline-none focus:border-volt';

  return (
    <div className="space-y-3">
      {value.map((s, i) => (
        <div key={i} className="rounded-lg border border-border bg-surface-2/40 p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs text-text-lo">
              {i + 1}
            </span>
            <input
              aria-label={t('admin.plans.stageName')}
              placeholder={t('admin.plans.stageName')}
              value={s.name}
              onChange={(e) => patch(i, { name: e.target.value })}
              required
              className="h-9 flex-1 rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt"
            />
            <input
              aria-label={t('admin.plans.duration')}
              placeholder={t('admin.plans.duration')}
              inputMode="numeric"
              value={String(s.expectedMinutes)}
              onChange={(e) =>
                patch(i, { expectedMinutes: e.target.value === '' ? 0 : Number(e.target.value) })
              }
              className={`${metaInput} w-24`}
            />
            <button
              type="button"
              aria-label={t('admin.plans.removeStage')}
              onClick={() => remove(i)}
              className="rounded-sm p-1.5 text-text-dim hover:bg-[rgba(255,77,109,0.1)] hover:text-danger"
            >
              <Icon name="trash" className="!h-4 !w-4" />
            </button>
          </div>
          <label className="mb-2 block">
            <span className="mb-1 block text-[11px] font-semibold text-text-dim">
              {t('admin.plans.checklist')}
            </span>
            <textarea
              rows={2}
              value={(s.checklist ?? []).join('\n')}
              onChange={(e) =>
                patch(i, { checklist: e.target.value.split('\n').filter((l) => l.trim()) })
              }
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-text-hi outline-none focus:border-volt"
            />
          </label>
          <div>
            <span className="mb-1 block text-[11px] font-semibold text-text-dim">
              {t('admin.plans.requiredComponents')}
            </span>
            <div className="flex flex-wrap gap-2">
              {COMPONENT_TYPES.map((tp) => {
                const on = (s.requiredComponents ?? []).includes(tp);
                return (
                  <label
                    key={tp}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs ${
                      on
                        ? 'border-volt bg-[rgba(124,125,250,0.12)] text-text-hi'
                        : 'border-border text-text-lo'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={(e) => toggleComponent(i, tp, e.target.checked)}
                    />
                    {t(`admin.bundleTypes.${tp}`)}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={add}>
        <Icon name="plus" className="!h-4 !w-4" /> {t('admin.plans.addStage')}
      </Button>
    </div>
  );
}
