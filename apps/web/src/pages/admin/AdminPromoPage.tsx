import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import {
  useCreatePromo,
  useDeletePromo,
  usePromoCodes,
  useUpdatePromo,
} from '../../features/admin/api';
import { formatMoney } from '../../features/catalog/format';
import type { AdminPromoCode, PromoType, UpdatePromoCodeRequest } from '@advault/types';

/** Promo codes CRUD (docs/13 §12). Manager/admin only. */
export function AdminPromoPage() {
  const { t } = useTranslation();
  const promos = usePromoCodes();
  const [showForm, setShowForm] = useState(false);

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
                <PromoRow key={p.id} promo={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** ISO date-time → yyyy-mm-dd for a native date input (empty when null). */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

const cellInputClass =
  'h-9 w-full rounded-md border border-border bg-surface-2 px-2 text-sm text-text-hi outline-none focus:border-volt';

/**
 * One promo row that flips between a read-only view and an inline editor
 * (E8 debt). Code is the redemption key and stays immutable; type / value /
 * max uses / expiry are editable via PATCH (FINANCE_STAFF, audited server-side).
 */
function PromoRow({ promo }: { promo: AdminPromoCode }) {
  const { t, i18n } = useTranslation();
  const del = useDeletePromo();
  const update = useUpdatePromo();

  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<PromoType>(promo.type);
  const [value, setValue] = useState(promo.value);
  const [maxUses, setMaxUses] = useState(promo.maxUses === null ? '' : String(promo.maxUses));
  const [expiresAt, setExpiresAt] = useState(toDateInput(promo.expiresAt));
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setType(promo.type);
    setValue(promo.value);
    setMaxUses(promo.maxUses === null ? '' : String(promo.maxUses));
    setExpiresAt(toDateInput(promo.expiresAt));
    setError(null);
    setEditing(true);
  };

  const formatValue = (p: AdminPromoCode): string =>
    p.type === 'percent' ? `${Number(p.value)}%` : formatMoney(p.value, 'USD');

  /** Only the fields the operator actually changed go into the PATCH. */
  const buildPatch = (): UpdatePromoCodeRequest => {
    const patch: UpdatePromoCodeRequest = {};
    if (type !== promo.type) patch.type = type;
    if (value.trim() && Number(value) !== Number(promo.value)) patch.value = value.trim();
    const nextMax = maxUses.trim() ? Number(maxUses) : null;
    if (nextMax !== promo.maxUses) patch.maxUses = nextMax;
    const nextExp = expiresAt ? new Date(expiresAt).toISOString() : null;
    if (toDateInput(nextExp) !== toDateInput(promo.expiresAt)) patch.expiresAt = nextExp;
    return patch;
  };

  const save = () => {
    setError(null);
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      setEditing(false); // nothing changed
      return;
    }
    update.mutate(
      { id: promo.id, ...patch },
      {
        onSuccess: () => setEditing(false),
        onError: () => setError(t('admin.promo.saveError')),
      },
    );
  };

  if (editing) {
    return (
      <tr className="border-b border-border last:border-0 align-top">
        <td className="px-4 py-3 font-display font-bold text-text-hi">{promo.code}</td>
        <td className="px-4 py-3">
          <select
            aria-label={t('admin.promo.type')}
            value={type}
            onChange={(e) => setType(e.target.value as PromoType)}
            className={cellInputClass}
          >
            <option value="percent">{t('admin.promo.percent')}</option>
            <option value="fixed">{t('admin.promo.fixed')}</option>
          </select>
        </td>
        <td className="px-4 py-3">
          <input
            aria-label={t('admin.promo.value')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            className={`${cellInputClass} text-right`}
          />
        </td>
        <td className="px-4 py-3">
          <input
            aria-label={t('admin.promo.maxUses')}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            inputMode="numeric"
            placeholder={t('admin.promo.maxUsesPlaceholder')}
            className={`${cellInputClass} text-right`}
          />
        </td>
        <td className="px-4 py-3">
          <input
            aria-label={t('admin.promo.expiresAt')}
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={cellInputClass}
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            {error && <span className="mr-2 text-[11px] text-danger">{error}</span>}
            <button
              type="button"
              aria-label={t('admin.promo.save')}
              disabled={update.isPending}
              onClick={save}
              className="rounded-sm p-1.5 text-success transition-colors hover:bg-[rgba(52,211,153,0.12)] disabled:opacity-50"
            >
              <Icon name="check" className="!h-4 !w-4" />
            </button>
            <button
              type="button"
              aria-label={t('admin.promo.cancel')}
              onClick={() => setEditing(false)}
              className="rounded-sm p-1.5 text-text-dim transition-colors hover:bg-surface-2 hover:text-text-hi"
            >
              <Icon name="x" className="!h-4 !w-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 font-display font-bold text-text-hi">{promo.code}</td>
      <td className="px-4 py-3 text-text-lo">{t(`admin.promo.${promo.type}`)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-text-hi">{formatValue(promo)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-text-lo">
        {promo.usedCount}
        {promo.maxUses !== null ? ` / ${promo.maxUses}` : ` / ∞`}
      </td>
      <td className="px-4 py-3 text-text-dim">
        {promo.expiresAt
          ? new Date(promo.expiresAt).toLocaleDateString(i18n.resolvedLanguage, {
              dateStyle: 'medium',
            })
          : t('admin.promo.never')}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            aria-label={t('admin.promo.edit')}
            onClick={startEdit}
            className="rounded-sm p-1.5 text-text-dim transition-colors hover:bg-surface-2 hover:text-text-hi"
          >
            <Icon name="pencil" className="!h-4 !w-4" />
          </button>
          <button
            type="button"
            aria-label={t('admin.promo.delete')}
            onClick={() => {
              if (window.confirm(t('admin.promo.deleteConfirm'))) del.mutate(promo.id);
            }}
            className="rounded-sm p-1.5 text-text-dim transition-colors hover:bg-[rgba(255,77,109,0.1)] hover:text-danger"
          >
            <Icon name="trash" className="!h-4 !w-4" />
          </button>
        </div>
      </td>
    </tr>
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
