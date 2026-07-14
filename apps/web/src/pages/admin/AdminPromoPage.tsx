import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useCreatePromo, useDeletePromo, usePromoCodes } from '../../features/admin/api';
import { formatMoney } from '../../features/catalog/format';
import type { AdminPromoCode, PromoType } from '@advault/types';

/** Promo codes CRUD (docs/13 §12). Manager/admin only. */
export function AdminPromoPage() {
  const { t, i18n } = useTranslation();
  const promos = usePromoCodes();
  const [showForm, setShowForm] = useState(false);
  const del = useDeletePromo();

  const formatValue = (p: AdminPromoCode): string =>
    p.type === 'percent' ? `${Number(p.value)}%` : formatMoney(p.value, 'USD');

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t('admin.promo.title')}</h1>
          <p className="text-sm text-text-lo">{t('admin.promo.subtitle')}</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Icon name={showForm ? 'x' : 'plus'} className="!h-4 !w-4" /> {t('admin.promo.create')}
        </Button>
      </div>

      {showForm && <PromoForm onDone={() => setShowForm(false)} />}

      {promos.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : promos.isError ? (
        <>
          <Banner tone="error">{t('admin.promo.error')}</Banner>
          <Button variant="secondary" onClick={() => void promos.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : promos.data!.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="tag" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.promo.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="px-4 py-3 font-semibold">{t('admin.promo.colCode')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin.promo.colType')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('admin.promo.colValue')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('admin.promo.colUses')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin.promo.colExpiry')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {promos.data!.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-display font-bold text-text-hi">{p.code}</td>
                  <td className="px-4 py-3 text-text-lo">{t(`admin.promo.${p.type}`)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-hi">
                    {formatValue(p)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-lo">
                    {p.usedCount}
                    {p.maxUses !== null ? ` / ${p.maxUses}` : ` / ∞`}
                  </td>
                  <td className="px-4 py-3 text-text-dim">
                    {p.expiresAt
                      ? new Date(p.expiresAt).toLocaleDateString(i18n.resolvedLanguage, {
                          dateStyle: 'medium',
                        })
                      : t('admin.promo.never')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label={t('admin.promo.delete')}
                      onClick={() => {
                        if (window.confirm(t('admin.promo.deleteConfirm'))) del.mutate(p.id);
                      }}
                      className="rounded-sm p-1.5 text-text-dim transition-colors hover:bg-[rgba(255,77,109,0.1)] hover:text-danger"
                    >
                      <Icon name="trash" className="!h-4 !w-4" />
                    </button>
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

function PromoForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [type, setType] = useState<PromoType>('percent');
  const [value, setValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreatePromo();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate(
      {
        code: code.trim(),
        type,
        value: value.trim(),
        maxUses: maxUses.trim() ? Number(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      },
      {
        onSuccess: () => {
          onDone();
        },
        onError: () => setError(t('admin.promo.saveError')),
      },
    );
  };

  const fieldClass =
    'h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt';

  return (
    <form
      onSubmit={submit}
      className="mb-6 rounded-xl border border-border bg-surface p-5"
      aria-label={t('admin.promo.create')}
    >
      {error && <Banner tone="error">{error}</Banner>}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="promo-code" className="mb-1 block text-xs font-semibold text-text-lo">
            {t('admin.promo.code')}
          </label>
          <input
            id="promo-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] text-text-dim">{t('admin.promo.codeHint')}</p>
        </div>
        <div>
          <label htmlFor="promo-type" className="mb-1 block text-xs font-semibold text-text-lo">
            {t('admin.promo.type')}
          </label>
          <select
            id="promo-type"
            value={type}
            onChange={(e) => setType(e.target.value as PromoType)}
            className={fieldClass}
          >
            <option value="percent">{t('admin.promo.percent')}</option>
            <option value="fixed">{t('admin.promo.fixed')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="promo-value" className="mb-1 block text-xs font-semibold text-text-lo">
            {t('admin.promo.value')}
          </label>
          <input
            id="promo-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            required
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] text-text-dim">
            {type === 'percent'
              ? t('admin.promo.valueHintPercent')
              : t('admin.promo.valueHintFixed')}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="promo-max" className="mb-1 block text-xs font-semibold text-text-lo">
              {t('admin.promo.maxUses')}
            </label>
            <input
              id="promo-max"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              inputMode="numeric"
              placeholder={t('admin.promo.maxUsesPlaceholder')}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="promo-exp" className="mb-1 block text-xs font-semibold text-text-lo">
              {t('admin.promo.expiresAt')}
            </label>
            <input
              id="promo-exp"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <Button type="submit" loading={create.isPending}>
          {t('admin.promo.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('admin.promo.cancel')}
        </Button>
      </div>
    </form>
  );
}
