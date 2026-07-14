import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import {
  useCreateOcto,
  useCreateProxy,
  useImportProxies,
  useOctoProfiles,
  useProxies,
} from '../../features/admin/api';
import { OctoStatusBadge, ProxyStatusBadge } from '../../features/admin/badges';
import type { ProxyType } from '@advault/types';

const PROXY_TYPES: ProxyType[] = ['residential', 'mobile', 'isp', 'datacenter'];

/**
 * Proxy / Octo inventory management (docs/13, E7): list, create, import (text),
 * and see binding state. Provisioning is manual — the platform only records
 * resources. Credentials are entered here but never shown back.
 */
export function InventoryPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'proxies' | 'octo'>('proxies');

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-8 md:px-8">
      <h1 className="mb-1 text-2xl font-bold">{t('admin.inventory.title')}</h1>
      <p className="mb-6 text-sm text-text-lo">{t('admin.inventory.subtitle')}</p>

      <div className="mb-6 flex gap-2" role="tablist">
        {(['proxies', 'octo'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key ? 'bg-surface-2 text-text-hi' : 'text-text-lo hover:text-text-hi'
            }`}
          >
            {t(`admin.inventory.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'proxies' ? <ProxySection /> : <OctoSection />}
    </div>
  );
}

function ProxySection() {
  const { t } = useTranslation();
  const proxies = useProxies({ page: 1, limit: 100 });
  const create = useCreateProxy();
  const importer = useImportProxies();

  const [type, setType] = useState<ProxyType>('residential');
  const [geo, setGeo] = useState('');
  const [provider, setProvider] = useState('');
  const [credentials, setCredentials] = useState('');
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submitCreate = async () => {
    setErr(null);
    setMsg(null);
    try {
      await create.mutateAsync({ type, geo, provider, credentials });
      setGeo('');
      setProvider('');
      setCredentials('');
      setMsg(t('admin.inventory.created'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('admin.warming.actionError'));
    }
  };

  const submitImport = async () => {
    setErr(null);
    setMsg(null);
    try {
      const report = await importer.mutateAsync(importText);
      setImportText('');
      setMsg(t('admin.inventory.imported', { added: report.added, skipped: report.skipped }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('admin.warming.actionError'));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-dim">
          {t('admin.inventory.proxyPool')}
        </h2>
        <InventoryList
          loading={proxies.isLoading}
          error={proxies.isError}
          empty={(proxies.data?.data.length ?? 0) === 0}
          onRetry={() => void proxies.refetch()}
          emptyLabel={t('admin.inventory.noProxies')}
        >
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-3 py-2.5 font-semibold">{t('admin.inventory.provider')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('admin.inventory.geo')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('admin.inventory.type')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('admin.inventory.status')}</th>
                </tr>
              </thead>
              <tbody>
                {(proxies.data?.data ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 text-text-hi">{p.provider}</td>
                    <td className="px-3 py-2.5 text-text-lo">{p.geo}</td>
                    <td className="px-3 py-2.5 text-text-lo">{t(`admin.proxyTypes.${p.type}`)}</td>
                    <td className="px-3 py-2.5">
                      <ProxyStatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InventoryList>
      </div>

      <div className="flex flex-col gap-6">
        {msg && <Banner tone="success">{msg}</Banner>}
        {err && <Banner tone="error">{err}</Banner>}

        <section className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-bold text-text-hi">{t('admin.inventory.addProxy')}</h3>
          <div className="flex flex-col gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ProxyType)}
              className="h-10 rounded-md border border-border bg-void px-3 text-sm text-text-hi outline-none focus:border-volt"
            >
              {PROXY_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {t(`admin.proxyTypes.${pt}`)}
                </option>
              ))}
            </select>
            <input
              value={geo}
              onChange={(e) => setGeo(e.target.value)}
              placeholder={t('admin.inventory.geoPh')}
              className="h-10 rounded-md border border-border bg-void px-3 text-sm text-text-hi outline-none focus:border-volt"
            />
            <input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder={t('admin.inventory.providerPh')}
              className="h-10 rounded-md border border-border bg-void px-3 text-sm text-text-hi outline-none focus:border-volt"
            />
            <input
              value={credentials}
              onChange={(e) => setCredentials(e.target.value)}
              placeholder="host:port:user:pass"
              className="h-10 rounded-md border border-border bg-void px-3 font-mono text-xs text-text-hi outline-none focus:border-volt"
            />
            <p className="text-[11px] text-text-dim">{t('admin.inventory.credHint')}</p>
            <Button
              className="!h-10 text-sm"
              loading={create.isPending}
              disabled={!geo.trim() || !provider.trim() || !credentials.trim()}
              onClick={() => void submitCreate()}
            >
              <Icon name="plus" className="!h-4 !w-4" /> {t('admin.inventory.add')}
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-bold text-text-hi">{t('admin.inventory.import')}</h3>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={4}
            placeholder={'residential,US,BrightData,host:port:user:pass'}
            className="w-full rounded-md border border-border bg-void px-3 py-2 font-mono text-[11px] text-text-hi outline-none focus:border-volt"
          />
          <p className="mb-2 text-[11px] text-text-dim">{t('admin.inventory.importHint')}</p>
          <Button
            variant="secondary"
            className="!h-10 text-sm"
            loading={importer.isPending}
            disabled={!importText.trim()}
            onClick={() => void submitImport()}
          >
            {t('admin.inventory.importBtn')}
          </Button>
        </section>
      </div>
    </div>
  );
}

function OctoSection() {
  const { t } = useTranslation();
  const octo = useOctoProfiles({ page: 1, limit: 100 });
  const create = useCreateOcto();

  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [exportRef, setExportRef] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setMsg(null);
    try {
      await create.mutateAsync({
        name,
        externalId: externalId || undefined,
        exportRef: exportRef || undefined,
      });
      setName('');
      setExternalId('');
      setExportRef('');
      setMsg(t('admin.inventory.created'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('admin.warming.actionError'));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-dim">
          {t('admin.inventory.octoPool')}
        </h2>
        <InventoryList
          loading={octo.isLoading}
          error={octo.isError}
          empty={(octo.data?.data.length ?? 0) === 0}
          onRetry={() => void octo.refetch()}
          emptyLabel={t('admin.inventory.noOcto')}
        >
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-3 py-2.5 font-semibold">{t('admin.inventory.name')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('admin.inventory.externalId')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('admin.inventory.status')}</th>
                </tr>
              </thead>
              <tbody>
                {(octo.data?.data ?? []).map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 text-text-hi">{o.name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-text-lo">
                      {o.externalId ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <OctoStatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InventoryList>
      </div>

      <div className="flex flex-col gap-6">
        {msg && <Banner tone="success">{msg}</Banner>}
        {err && <Banner tone="error">{err}</Banner>}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-bold text-text-hi">{t('admin.inventory.addOcto')}</h3>
          <div className="flex flex-col gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('admin.inventory.namePh')}
              className="h-10 rounded-md border border-border bg-void px-3 text-sm text-text-hi outline-none focus:border-volt"
            />
            <input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder={t('admin.inventory.externalIdPh')}
              className="h-10 rounded-md border border-border bg-void px-3 text-sm text-text-hi outline-none focus:border-volt"
            />
            <input
              value={exportRef}
              onChange={(e) => setExportRef(e.target.value)}
              placeholder={t('admin.inventory.exportRefPh')}
              className="h-10 rounded-md border border-border bg-void px-3 font-mono text-xs text-text-hi outline-none focus:border-volt"
            />
            <p className="text-[11px] text-text-dim">{t('admin.inventory.credHint')}</p>
            <Button
              className="!h-10 text-sm"
              loading={create.isPending}
              disabled={!name.trim()}
              onClick={() => void submit()}
            >
              <Icon name="plus" className="!h-4 !w-4" /> {t('admin.inventory.add')}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function InventoryList({
  loading,
  error,
  empty,
  onRetry,
  emptyLabel,
  children,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry: () => void;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-surface" aria-hidden />;
  if (error) {
    return (
      <>
        <Banner tone="error">{t('admin.inventory.error')}</Banner>
        <Button variant="secondary" onClick={onRetry}>
          {t('admin.retry')}
        </Button>
      </>
    );
  }
  if (empty) {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-10 text-center text-sm text-text-lo">
        {emptyLabel}
      </div>
    );
  }
  return <>{children}</>;
}
