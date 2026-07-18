import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import {
  useAdminCategories,
  useAdminProduct,
  useCreateVariant,
  useUpdateProduct,
  useUpdateVariant,
  useWarmingPlans,
} from '../../features/admin/api';
import { ProductStatusBadge } from '../../features/admin/badges';
import { formatMoney } from '../../features/catalog/format';
import type {
  AdminCategory,
  AdminProductDetail,
  AdminVariant,
  AdminWarmingPlanListItem,
  BundleComponent,
  BundleComponentType,
  CreateVariantRequest,
  FulfillmentType,
  ProductStatus,
  ProxyType,
} from '@advault/types';

const fieldClass =
  'h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt';
const labelClass = 'mb-1 block text-xs font-semibold text-text-lo';

const COMPONENT_TYPES: BundleComponentType[] = [
  'ACCOUNT',
  'PROXY',
  'OCTO_PROFILE',
  'RECOVERY',
  'SECRETS',
  'GUIDE',
  'WARRANTY',
];
const PROXY_TYPES: ProxyType[] = ['residential', 'mobile', 'isp', 'datacenter'];

/** Product detail: edit info + status, variants and the bundle constructor. */
export function AdminProductDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const product = useAdminProduct(id);
  const categories = useAdminCategories();
  const plans = useWarmingPlans();
  const update = useUpdateProduct(id!);
  const [addingVariant, setAddingVariant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (product.isLoading) {
    return (
      <div className="mx-auto max-w-[1000px] p-8" aria-hidden>
        <div className="h-40 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }
  if (product.isError || !product.data) {
    return (
      <div className="mx-auto max-w-[1000px] p-8">
        <Banner tone="error">{t('admin.catalog.notFound')}</Banner>
        <Link to="/admin/catalog" className="text-sm text-volt-400">
          {t('admin.catalog.backToList')}
        </Link>
      </div>
    );
  }
  const p = product.data;

  const setStatus = (status: ProductStatus, confirmKey?: string) => {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    setError(null);
    update.mutate({ status }, { onError: () => setError(t('admin.catalog.saveError')) });
  };

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-8 md:px-8">
      <Link
        to="/admin/catalog"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-lo hover:text-text-hi"
      >
        <Icon name="arrow-left" className="!h-3.5 !w-3.5" /> {t('admin.catalog.backToList')}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold">{p.slug}</h1>
            <ProductStatusBadge status={p.status} />
          </div>
          <p className="text-sm text-text-dim">{p.categorySlug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status !== 'published' && (
            <Button onClick={() => setStatus('published', 'admin.catalog.publishConfirm')}>
              {t('admin.catalog.publish')}
            </Button>
          )}
          {p.status === 'published' && (
            <Button variant="secondary" onClick={() => setStatus('draft')}>
              {t('admin.catalog.unpublish')}
            </Button>
          )}
          {p.status !== 'hidden' && (
            <Button
              variant="ghost"
              onClick={() => setStatus('hidden', 'admin.catalog.archiveConfirm')}
            >
              {t('admin.catalog.archive')}
            </Button>
          )}
        </div>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      <ProductInfoForm product={p} categories={categories.data ?? []} />

      <div className="mb-4 mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('admin.catalog.variantsTitle')}</h2>
        <Button variant="secondary" onClick={() => setAddingVariant((v) => !v)}>
          <Icon name={addingVariant ? 'x' : 'plus'} className="!h-4 !w-4" />{' '}
          {t('admin.catalog.addVariant')}
        </Button>
      </div>

      {addingVariant && (
        <VariantEditor
          productId={p.id}
          plans={plans.data ?? []}
          onDone={() => setAddingVariant(false)}
        />
      )}

      {p.variants.length === 0 && !addingVariant ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-10 text-center text-text-lo">
          {t('admin.catalog.noVariants')}
        </div>
      ) : (
        <div className="space-y-3">
          {p.variants.map((v) => (
            <VariantRow key={v.id} variant={v} plans={plans.data ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductInfoForm({
  product,
  categories,
}: {
  product: AdminProductDetail;
  categories: AdminCategory[];
}) {
  const { t } = useTranslation();
  const update = useUpdateProduct(product.id);
  const enTr = product.translations.find((tr) => tr.locale === 'en');
  const ruTr = product.translations.find((tr) => tr.locale === 'ru');
  const [slug, setSlug] = useState(product.slug);
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [nameEn, setNameEn] = useState(enTr?.name ?? '');
  const [nameRu, setNameRu] = useState(ruTr?.name ?? '');
  const [descEn, setDescEn] = useState(enTr?.description ?? '');
  const [descRu, setDescRu] = useState(ruTr?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    update.mutate(
      {
        slug: slug.trim(),
        categoryId,
        translations: [
          { locale: 'en', name: nameEn.trim(), description: descEn.trim() || null },
          ...(nameRu.trim()
            ? [{ locale: 'ru' as const, name: nameRu.trim(), description: descRu.trim() || null }]
            : []),
        ],
      },
      { onError: () => setError(t('admin.catalog.saveError')) },
    );
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-5">
      {error && <Banner tone="error">{error}</Banner>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className={labelClass}>{t('admin.catalog.slug')}</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className={fieldClass} />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.catalog.category')}</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={fieldClass}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.names.en} ({c.slug})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.catalog.nameEn')}</span>
          <input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.catalog.nameRu')}</span>
          <input
            value={nameRu}
            onChange={(e) => setNameRu(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.catalog.descEn')}</span>
          <textarea
            value={descEn}
            onChange={(e) => setDescEn(e.target.value)}
            rows={2}
            className={`${fieldClass} h-auto py-2`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.catalog.descRu')}</span>
          <textarea
            value={descRu}
            onChange={(e) => setDescRu(e.target.value)}
            rows={2}
            className={`${fieldClass} h-auto py-2`}
          />
        </label>
      </div>
      <div className="mt-4">
        <Button type="submit" loading={update.isPending}>
          {t('admin.catalog.save')}
        </Button>
      </div>
    </form>
  );
}

function VariantRow({
  variant,
  plans,
}: {
  variant: AdminVariant;
  plans: AdminWarmingPlanListItem[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const update = useUpdateVariant();

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <span className="font-display font-bold text-text-hi">{variant.sku}</span>
          <span className="ml-3 text-sm text-text-lo">
            {formatMoney(variant.price, variant.currency)} ·{' '}
            {t(`admin.fulfillmentTypes.${variant.fulfillmentType}`)}
            {variant.etaMinutes !== null &&
              ` · ${t('admin.catalog.minutes', { count: variant.etaMinutes })}`}
          </span>
          {!variant.isActive && (
            <span className="ml-2 rounded-pill bg-surface-2 px-2 py-0.5 text-[10px] uppercase text-text-dim">
              {t('admin.catalog.archived')}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => update.mutate({ id: variant.id, isActive: !variant.isActive })}
          >
            {variant.isActive ? t('admin.catalog.archiveVariant') : t('admin.catalog.activate')}
          </Button>
          <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
            <Icon name={open ? 'x' : 'eye'} className="!h-4 !w-4" />
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border p-5">
          <VariantEditor
            productId={variant.productId}
            plans={plans}
            variant={variant}
            onDone={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

/** Create/edit a variant with the bundle constructor. */
function VariantEditor({
  productId,
  plans,
  variant,
  onDone,
}: {
  productId: string;
  plans: AdminWarmingPlanListItem[];
  variant?: AdminVariant;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateVariant(productId);
  const update = useUpdateVariant();
  const isEdit = Boolean(variant);

  const [sku, setSku] = useState(variant?.sku ?? '');
  const [price, setPrice] = useState(variant?.price ?? '');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>(
    variant?.fulfillmentType ?? 'READY_STOCK',
  );
  const [goal, setGoal] = useState(variant?.goal ?? '');
  const [tier, setTier] = useState(variant?.tier ?? '');
  const [warmingPlanId, setWarmingPlanId] = useState(variant?.warmingPlanId ?? '');
  const [etaMinutes, setEtaMinutes] = useState(
    variant?.etaMinutes != null ? String(variant.etaMinutes) : '',
  );
  const [warrantyHours, setWarrantyHours] = useState(
    variant?.warrantyHours != null ? String(variant.warrantyHours) : '',
  );
  const [nameEn, setNameEn] = useState(variant?.names.en ?? '');
  const [nameRu, setNameRu] = useState(variant?.names.ru ?? '');
  const [bundle, setBundle] = useState<BundleComponent[]>(variant?.bundle ?? []);
  const [error, setError] = useState<string | null>(null);

  const isWarm = fulfillmentType === 'MADE_TO_ORDER';
  const hasPlan = isWarm && warmingPlanId !== '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body: CreateVariantRequest = {
      sku: sku.trim(),
      price: price.trim(),
      fulfillmentType,
      goal: goal.trim() || null,
      tier: tier.trim() || null,
      warmingPlanId: isWarm && warmingPlanId ? warmingPlanId : null,
      etaMinutes: isWarm && !warmingPlanId && etaMinutes ? Number(etaMinutes) : null,
      warrantyHours: warrantyHours ? Number(warrantyHours) : null,
      bundle,
      names: {
        ...(nameEn.trim() ? { en: nameEn.trim() } : {}),
        ...(nameRu.trim() ? { ru: nameRu.trim() } : {}),
      },
    };
    const opts = { onSuccess: onDone, onError: () => setError(t('admin.catalog.saveError')) };
    if (variant) update.mutate({ id: variant.id, ...body }, opts);
    else create.mutate(body, opts);
  };

  return (
    <form onSubmit={submit} aria-label={t('admin.catalog.addVariant')}>
      {error && <Banner tone="error">{error}</Banner>}
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className={labelClass}>{t('admin.catalog.sku')}</span>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.catalog.price')}</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            required
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.catalog.fulfillment')}</span>
          <select
            value={fulfillmentType}
            onChange={(e) => setFulfillmentType(e.target.value as FulfillmentType)}
            className={fieldClass}
          >
            <option value="READY_STOCK">{t('admin.fulfillmentTypes.READY_STOCK')}</option>
            <option value="MADE_TO_ORDER">{t('admin.fulfillmentTypes.MADE_TO_ORDER')}</option>
          </select>
        </label>

        {isWarm && (
          <>
            <label className="block">
              <span className={labelClass}>{t('admin.catalog.goal')}</span>
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>{t('admin.catalog.tier')}</span>
              <input
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>{t('admin.catalog.plan')}</span>
              <select
                value={warmingPlanId}
                onChange={(e) => setWarmingPlanId(e.target.value)}
                className={fieldClass}
              >
                <option value="">{t('admin.catalog.planNone')}</option>
                {plans.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name} · v{pl.version} ({pl.etaMinutes}m)
                  </option>
                ))}
              </select>
            </label>
            {!hasPlan && (
              <label className="block">
                <span className={labelClass}>{t('admin.catalog.etaManual')}</span>
                <input
                  value={etaMinutes}
                  onChange={(e) => setEtaMinutes(e.target.value)}
                  inputMode="numeric"
                  className={fieldClass}
                />
              </label>
            )}
            {hasPlan && (
              <div className="flex items-end">
                <p className="text-xs text-text-dim">{t('admin.catalog.etaFromPlan')}</p>
              </div>
            )}
          </>
        )}

        <label className="block">
          <span className={labelClass}>{t('admin.catalog.warranty')}</span>
          <input
            value={warrantyHours}
            onChange={(e) => setWarrantyHours(e.target.value)}
            inputMode="numeric"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.catalog.nameEn')}</span>
          <input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t('admin.catalog.nameRu')}</span>
          <input
            value={nameRu}
            onChange={(e) => setNameRu(e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      <BundleConstructor value={bundle} onChange={setBundle} />

      <div className="mt-4 flex gap-3">
        <Button type="submit" loading={create.isPending || update.isPending}>
          {isEdit ? t('admin.catalog.saveVariant') : t('admin.catalog.createVariant')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('admin.catalog.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** The delivery-kit constructor: pick components + typed params (docs/13 §5). */
function BundleConstructor({
  value,
  onChange,
}: {
  value: BundleComponent[];
  onChange: (b: BundleComponent[]) => void;
}) {
  const { t } = useTranslation();
  const byType = useMemo(() => {
    const map = new Map<BundleComponentType, Record<string, unknown>>();
    for (const c of value) map.set(c.type, c.meta ?? {});
    return map;
  }, [value]);

  const emit = (map: Map<BundleComponentType, Record<string, unknown>>) => {
    onChange(
      COMPONENT_TYPES.filter((tp) => map.has(tp)).map((tp) => {
        const meta = map.get(tp)!;
        return Object.keys(meta).length > 0 ? { type: tp, meta } : { type: tp };
      }),
    );
  };
  const toggle = (tp: BundleComponentType, on: boolean) => {
    const map = new Map(byType);
    if (on) map.set(tp, byType.get(tp) ?? {});
    else map.delete(tp);
    emit(map);
  };
  const setMeta = (tp: BundleComponentType, key: string, v: string) => {
    const map = new Map(byType);
    const meta = { ...(map.get(tp) ?? {}) };
    if (v) meta[key] = v;
    else delete meta[key];
    map.set(tp, meta);
    emit(map);
  };

  const metaInput =
    'h-9 rounded-md border border-border bg-surface-2 px-2 text-xs text-text-hi outline-none focus:border-volt';

  return (
    <fieldset className="mt-5 rounded-xl border border-border bg-surface-2/40 p-4">
      <legend className="px-1 text-xs font-semibold text-text-lo">
        {t('admin.catalog.bundle')}
      </legend>
      <p className="mb-3 text-[11px] text-text-dim">{t('admin.catalog.bundleHint')}</p>
      <div className="space-y-2">
        {COMPONENT_TYPES.map((tp) => {
          const on = byType.has(tp);
          const meta = byType.get(tp) ?? {};
          return (
            <div key={tp} className="flex flex-wrap items-center gap-3">
              <label className="flex w-40 items-center gap-2 text-sm text-text-hi">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => toggle(tp, e.target.checked)}
                />
                {t(`admin.bundleTypes.${tp}`)}
              </label>
              {on && tp === 'PROXY' && (
                <>
                  <select
                    aria-label={t('admin.catalog.proxyType')}
                    value={String(meta.proxyType ?? '')}
                    onChange={(e) => setMeta(tp, 'proxyType', e.target.value)}
                    className={metaInput}
                  >
                    <option value="">{t('admin.catalog.proxyType')}</option>
                    {PROXY_TYPES.map((x) => (
                      <option key={x} value={x}>
                        {t(`admin.proxyTypes.${x}`)}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={t('admin.catalog.geo')}
                    placeholder={t('admin.catalog.geo')}
                    value={String(meta.geo ?? '')}
                    onChange={(e) => setMeta(tp, 'geo', e.target.value)}
                    className={`${metaInput} w-24`}
                  />
                  <input
                    aria-label={t('admin.catalog.term')}
                    placeholder={t('admin.catalog.term')}
                    value={String(meta.term ?? '')}
                    onChange={(e) => setMeta(tp, 'term', e.target.value)}
                    className={`${metaInput} w-24`}
                  />
                </>
              )}
              {on && tp === 'OCTO_PROFILE' && (
                <input
                  aria-label={t('admin.catalog.profileType')}
                  placeholder={t('admin.catalog.profileType')}
                  value={String(meta.profileType ?? '')}
                  onChange={(e) => setMeta(tp, 'profileType', e.target.value)}
                  className={`${metaInput} w-40`}
                />
              )}
              {on && tp === 'GUIDE' && (
                <select
                  aria-label={t('admin.catalog.guideLocale')}
                  value={String(meta.locale ?? '')}
                  onChange={(e) => setMeta(tp, 'locale', e.target.value)}
                  className={metaInput}
                >
                  <option value="">{t('admin.catalog.guideLocale')}</option>
                  <option value="en">EN</option>
                  <option value="ru">RU</option>
                </select>
              )}
              {on && tp === 'WARRANTY' && (
                <input
                  aria-label={t('admin.catalog.warrantyHours')}
                  placeholder={t('admin.catalog.warrantyHours')}
                  inputMode="numeric"
                  value={meta.hours != null ? String(meta.hours) : ''}
                  onChange={(e) => {
                    const map = new Map(byType);
                    const m = { ...(map.get(tp) ?? {}) };
                    if (e.target.value) m.hours = Number(e.target.value);
                    else delete m.hours;
                    map.set(tp, m);
                    emit(map);
                  }}
                  className={`${metaInput} w-24`}
                />
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
