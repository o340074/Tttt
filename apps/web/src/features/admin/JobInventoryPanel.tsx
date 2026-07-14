import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import {
  useBindOcto,
  useBindProxy,
  useJobInventory,
  useOctoProfiles,
  useProxies,
  useUnbindOcto,
  useUnbindProxy,
} from './api';
import { OctoStatusBadge, ProxyStatusBadge } from './badges';

/**
 * Binds proxy + Octo resources (E7) to a warming job from the operator
 * workspace. Shows what's bound, lets the operator pick a free resource and
 * bind/unbind exactly-once. Credentials are never shown — they reach the buyer
 * only through the delivered Vault bundle.
 */
export function JobInventoryPanel({
  jobId,
  onError,
}: {
  jobId: string;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const inventory = useJobInventory(jobId);
  const freeProxies = useProxies({ page: 1, limit: 50, unassigned: true });
  const freeOcto = useOctoProfiles({ page: 1, limit: 50, unassigned: true });
  const bindProxy = useBindProxy();
  const unbindProxy = useUnbindProxy();
  const bindOcto = useBindOcto();
  const unbindOcto = useUnbindOcto();

  const [proxyId, setProxyId] = useState('');
  const [octoId, setOctoId] = useState('');

  const guard = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : t('admin.warming.actionError'));
    }
  };

  const bound = inventory.data;

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-dim">
        {t('admin.warming.resources')}
      </h2>

      {inventory.isLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-surface-2" aria-hidden />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Proxy */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-text-lo">{t('admin.warming.proxy')}</span>
            </div>
            {bound?.proxy ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-void px-3 py-2">
                <span className="text-sm text-text-hi">
                  {bound.proxy.provider} · {bound.proxy.geo} ·{' '}
                  {t(`admin.proxyTypes.${bound.proxy.type}`)}
                </span>
                <div className="flex items-center gap-2">
                  <ProxyStatusBadge status={bound.proxy.status} />
                  <button
                    type="button"
                    onClick={() => void guard(() => unbindProxy.mutateAsync(bound.proxy!.id))}
                    className="text-text-dim hover:text-danger"
                    aria-label={t('admin.warming.unbind')}
                    title={t('admin.warming.unbind')}
                  >
                    <Icon name="x" className="!h-4 !w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={proxyId}
                  onChange={(e) => setProxyId(e.target.value)}
                  className="h-9 flex-1 rounded-md border border-border bg-void px-2 text-sm text-text-hi outline-none focus:border-volt"
                >
                  <option value="">{t('admin.warming.pickProxy')}</option>
                  {(freeProxies.data?.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.provider} · {p.geo} · {p.type}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  className="!h-9 text-sm"
                  disabled={!proxyId}
                  loading={bindProxy.isPending}
                  onClick={() =>
                    void guard(() => bindProxy.mutateAsync({ id: proxyId, jobId })).then(() =>
                      setProxyId(''),
                    )
                  }
                >
                  {t('admin.warming.bind')}
                </Button>
              </div>
            )}
          </div>

          {/* Octo */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-text-lo">{t('admin.warming.octo')}</span>
            </div>
            {bound?.octo ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-void px-3 py-2">
                <span className="text-sm text-text-hi">{bound.octo.name}</span>
                <div className="flex items-center gap-2">
                  <OctoStatusBadge status={bound.octo.status} />
                  <button
                    type="button"
                    onClick={() => void guard(() => unbindOcto.mutateAsync(bound.octo!.id))}
                    className="text-text-dim hover:text-danger"
                    aria-label={t('admin.warming.unbind')}
                    title={t('admin.warming.unbind')}
                  >
                    <Icon name="x" className="!h-4 !w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={octoId}
                  onChange={(e) => setOctoId(e.target.value)}
                  className="h-9 flex-1 rounded-md border border-border bg-void px-2 text-sm text-text-hi outline-none focus:border-volt"
                >
                  <option value="">{t('admin.warming.pickOcto')}</option>
                  {(freeOcto.data?.data ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  className="!h-9 text-sm"
                  disabled={!octoId}
                  loading={bindOcto.isPending}
                  onClick={() =>
                    void guard(() => bindOcto.mutateAsync({ id: octoId, jobId })).then(() =>
                      setOctoId(''),
                    )
                  }
                >
                  {t('admin.warming.bind')}
                </Button>
              </div>
            )}
          </div>

          <Link to="/admin/inventory" className="text-xs font-medium text-volt-400 hover:underline">
            {t('admin.warming.manageInventory')} →
          </Link>
        </div>
      )}
    </section>
  );
}
