import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui/Icon';
import { useHealth } from './useHealth';

function DependencyRow({ label, state }: { label: string; state: 'up' | 'down' }) {
  const { t } = useTranslation();
  const up = state === 'up';
  return (
    <li className="flex items-center justify-between border-t border-border py-3 text-sm">
      <span className="text-text-lo">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 font-medium ${up ? 'text-success' : 'text-danger'}`}
      >
        <Icon name={up ? 'check' : 'x'} className="text-[13px]" />
        {t(up ? 'health.up' : 'health.down')}
      </span>
    </li>
  );
}

export function HealthCard() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useHealth();

  return (
    <section
      aria-live="polite"
      className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-2"
    >
      <h2 className="mb-4 text-base font-semibold">{t('health.title')}</h2>

      {isPending && (
        <div className="flex items-center gap-3 py-2 text-sm text-text-lo">
          <span className="h-2.5 w-2.5 animate-pulse rounded-pill bg-volt" aria-hidden="true" />
          {t('health.loading')}
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-between gap-3 py-2">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-danger">
            <Icon name="x" className="text-[14px]" />
            {t('health.error')}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md border border-border-2 px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-2"
          >
            {t('health.retry')}
          </button>
        </div>
      )}

      {data && (
        <>
          <p
            className={`inline-flex items-center gap-2 text-sm font-medium ${
              data.status === 'ok' ? 'text-success' : 'text-warning'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-pill ${
                data.status === 'ok' ? 'bg-success shadow-glow-success' : 'bg-warning'
              }`}
              aria-hidden="true"
            />
            {t(data.status === 'ok' ? 'health.ok' : 'health.degraded')}
          </p>
          <ul className="mt-4">
            <DependencyRow label={t('health.database')} state={data.dependencies.database} />
            <DependencyRow label={t('health.redis')} state={data.dependencies.redis} />
            <li className="flex items-center justify-between border-t border-border py-3 text-sm">
              <span className="text-text-lo">{t('health.version')}</span>
              <span className="font-mono text-text">{data.version}</span>
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
