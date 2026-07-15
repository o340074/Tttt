import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useSettings, useUpdateSettings } from '../../features/admin/api';
import type { Locale, ShopSettings, UpdateSettingsRequest } from '@advault/types';

const LOCALES: Locale[] = ['en', 'ru'];
const TEMPLATE_KEYS = ['orderPaid', 'warmingReady', 'ticketReply'] as const;

/**
 * Settings / integrations (docs/13 §17). Admin-only shop config, languages and
 * notification templates. Integration flags are read-only "configured" badges —
 * secrets never appear here.
 */
export function AdminSettingsPage() {
  const { t } = useTranslation();
  const settings = useSettings();

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8 md:px-8">
      <h1 className="mb-1 text-2xl font-bold">{t('admin.settings.title')}</h1>
      <p className="mb-6 text-sm text-text-lo">{t('admin.settings.subtitle')}</p>

      {settings.isLoading ? (
        <div className="h-80 animate-pulse rounded-xl bg-surface" aria-hidden />
      ) : settings.isError ? (
        <>
          <Banner tone="error">{t('admin.settings.error')}</Banner>
          <Button variant="secondary" onClick={() => void settings.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : (
        <SettingsForm data={settings.data!} />
      )}
    </div>
  );
}

function SettingsForm({ data }: { data: ShopSettings }) {
  const { t } = useTranslation();
  const update = useUpdateSettings();
  const [form, setForm] = useState<ShopSettings>(data);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setForm(data), [data]);

  const toggleLocale = (loc: Locale) => {
    const has = form.enabledLocales.includes(loc);
    const enabledLocales = has
      ? form.enabledLocales.filter((l) => l !== loc)
      : [...form.enabledLocales, loc];
    setForm({ ...form, enabledLocales });
  };

  const save = () => {
    setError(null);
    setSaved(false);
    const patch: UpdateSettingsRequest = {
      storeName: form.storeName,
      supportEmail: form.supportEmail,
      defaultLocale: form.defaultLocale,
      enabledLocales: form.enabledLocales,
      notifications: form.notifications,
    };
    update.mutate(patch, {
      onSuccess: () => setSaved(true),
      onError: (e) => setError((e as Error).message || t('admin.settings.saveError')),
    });
  };

  const field =
    'h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt';

  return (
    <div className="space-y-6">
      {error && <Banner tone="error">{error}</Banner>}
      {saved && <Banner tone="success">{t('admin.settings.saved')}</Banner>}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-dim">
          {t('admin.settings.general')}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text-lo">{t('admin.settings.storeName')}</span>
            <input
              className={field}
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text-lo">{t('admin.settings.supportEmail')}</span>
            <input
              className={field}
              value={form.supportEmail}
              onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
            />
          </label>
        </div>

        <div className="mt-4">
          <span className="mb-1 block text-xs font-semibold text-text-lo">
            {t('admin.settings.languages')}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => toggleLocale(loc)}
                aria-pressed={form.enabledLocales.includes(loc)}
                className={`rounded-pill px-3 py-1 text-xs font-semibold uppercase transition-colors ${
                  form.enabledLocales.includes(loc)
                    ? 'bg-volt text-white'
                    : 'border border-border bg-surface text-text-lo hover:text-text-hi'
                }`}
              >
                {loc}
              </button>
            ))}
            <label className="ml-3 flex items-center gap-2 text-xs text-text-lo">
              {t('admin.settings.defaultLocale')}
              <select
                value={form.defaultLocale}
                onChange={(e) => setForm({ ...form, defaultLocale: e.target.value as Locale })}
                className="h-9 rounded-md border border-border bg-surface-2 px-2 text-sm text-text-hi outline-none focus:border-volt"
              >
                {form.enabledLocales.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-dim">
          {t('admin.settings.notifications')}
        </h2>
        <div className="space-y-4">
          {TEMPLATE_KEYS.map((key) => (
            <div key={key} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="mb-2 text-xs font-semibold text-text-hi">
                {t(`admin.settings.templates.${key}`)}
              </div>
              <input
                className="mb-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-hi outline-none focus:border-volt"
                value={form.notifications[key].subject}
                aria-label={t('admin.settings.subject')}
                placeholder={t('admin.settings.subject')}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notifications: {
                      ...form.notifications,
                      [key]: { ...form.notifications[key], subject: e.target.value },
                    },
                  })
                }
              />
              <textarea
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-hi outline-none focus:border-volt"
                rows={2}
                value={form.notifications[key].body}
                aria-label={t('admin.settings.body')}
                placeholder={t('admin.settings.body')}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notifications: {
                      ...form.notifications,
                      [key]: { ...form.notifications[key], body: e.target.value },
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-dim">
          {t('admin.settings.integrations')}
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <IntegrationFlag label={t('admin.settings.crypto')} ok={form.integrations.cryptoAcquiringConfigured} />
          <IntegrationFlag label={t('admin.settings.octo')} ok={form.integrations.octoApiConfigured} />
          <IntegrationFlag label={t('admin.settings.kms')} ok={form.integrations.kmsConfigured} />
        </div>
        <p className="mt-3 text-xs text-text-dim">{t('admin.settings.integrationsNote')}</p>
      </section>

      <div className="flex justify-end">
        <Button variant="primary" loading={update.isPending} onClick={save}>
          {t('admin.settings.save')}
        </Button>
      </div>
    </div>
  );
}

function IntegrationFlag({ label, ok }: { label: string; ok: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2">
      <span className="text-sm text-text-lo">{label}</span>
      <span
        className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold ${
          ok ? 'bg-[rgba(43,217,166,0.14)] text-success' : 'bg-surface text-text-dim'
        }`}
      >
        <Icon name={ok ? 'check' : 'x'} className="!h-3 !w-3" />
        {ok ? t('admin.settings.configured') : t('admin.settings.notConfigured')}
      </span>
    </div>
  );
}
