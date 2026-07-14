import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import {
  useAdminCategories,
  useAdminProducts,
  useCreateCategory,
  useCreateProduct,
} from '../../features/admin/api';
import { ProductStatusBadge } from '../../features/admin/badges';
import type { AdminProductQuery, ProductStatus } from '@advault/types';

const fieldClass =
  'h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt';

/** Catalog & bundles: products table + category manager (docs/13 §5). Manager+. */
export function AdminCatalogPage() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [q, setQ] = useState('');
  const query: AdminProductQuery = { ...(status ? { status } : {}), ...(q ? { q } : {}) };
  const products = useAdminProducts(query);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCategories, setShowCategories] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t('admin.catalog.title')}</h1>
          <p className="text-sm text-text-lo">{t('admin.catalog.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCategories((v) => !v)}>
            <Icon name="briefcase" className="!h-4 !w-4" /> {t('admin.catalog.categoriesTitle')}
          </Button>
          <Button onClick={() => setShowProductForm((v) => !v)}>
            <Icon name={showProductForm ? 'x' : 'plus'} className="!h-4 !w-4" />{' '}
            {t('admin.catalog.newProduct')}
          </Button>
        </div>
      </div>

      {showCategories && <CategoryManager />}
      {showProductForm && <ProductForm onDone={() => setShowProductForm(false)} />}

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.catalog.searchPlaceholder')}
          className={`${fieldClass} max-w-xs`}
          aria-label={t('admin.catalog.searchPlaceholder')}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProductStatus | '')}
          className={`${fieldClass} max-w-[200px]`}
          aria-label={t('admin.catalog.colStatus')}
        >
          <option value="">{t('admin.catalog.filterAll')}</option>
          {(['draft', 'published', 'hidden'] as ProductStatus[]).map((s) => (
            <option key={s} value={s}>
              {t(`admin.productStatuses.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {products.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : products.isError ? (
        <>
          <Banner tone="error">{t('admin.catalog.error')}</Banner>
          <Button variant="secondary" onClick={() => void products.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : products.data!.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="box" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.catalog.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="px-4 py-3 font-semibold">{t('admin.catalog.colName')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin.catalog.colCategory')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin.catalog.colStatus')}</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t('admin.catalog.colVariants')}
                </th>
                <th className="px-4 py-3 font-semibold">{t('admin.catalog.colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {products.data!.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/catalog/${p.id}`}
                      className="font-medium text-text-hi hover:text-volt-400"
                    >
                      {p.name}
                    </Link>
                    <div className="text-xs text-text-dim">{p.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-text-lo">{p.categorySlug}</td>
                  <td className="px-4 py-3">
                    <ProductStatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-lo">
                    {p.activeVariantCount} / {p.variantCount}
                  </td>
                  <td className="px-4 py-3 text-text-dim">
                    {new Date(p.createdAt).toLocaleDateString(i18n.resolvedLanguage, {
                      dateStyle: 'medium',
                    })}
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

function ProductForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const categories = useAdminCategories();
  const create = useCreateProduct();
  const [categoryId, setCategoryId] = useState('');
  const [slug, setSlug] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate(
      {
        categoryId,
        slug: slug.trim(),
        translations: [
          { locale: 'en', name: nameEn.trim() },
          ...(nameRu.trim() ? [{ locale: 'ru' as const, name: nameRu.trim() }] : []),
        ],
      },
      { onSuccess: onDone, onError: () => setError(t('admin.catalog.saveError')) },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="mb-6 rounded-xl border border-border bg-surface p-5"
      aria-label={t('admin.catalog.newProduct')}
    >
      {error && <Banner tone="error">{error}</Banner>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-lo">
            {t('admin.catalog.category')}
          </span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            className={fieldClass}
          >
            <option value="" disabled>
              —
            </option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.names.en} ({c.slug})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-lo">
            {t('admin.catalog.slug')}
          </span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-lo">
            {t('admin.catalog.nameEn')}
          </span>
          <input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            required
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-lo">
            {t('admin.catalog.nameRu')}
          </span>
          <input
            value={nameRu}
            onChange={(e) => setNameRu(e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>
      <div className="mt-4 flex gap-3">
        <Button type="submit" loading={create.isPending}>
          {t('admin.catalog.createProduct')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('admin.catalog.cancel')}
        </Button>
      </div>
    </form>
  );
}

function CategoryManager() {
  const { t } = useTranslation();
  const categories = useAdminCategories();
  const create = useCreateCategory();
  const [slug, setSlug] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate(
      {
        slug: slug.trim(),
        translations: [
          { locale: 'en', name: nameEn.trim() },
          ...(nameRu.trim() ? [{ locale: 'ru' as const, name: nameRu.trim() }] : []),
        ],
      },
      {
        onSuccess: () => {
          setSlug('');
          setNameEn('');
          setNameRu('');
        },
        onError: () => setError(t('admin.catalog.saveError')),
      },
    );
  };

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold text-text-hi">
        {t('admin.catalog.categoriesTitle')}
      </h2>
      {categories.data && categories.data.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2">
          {categories.data.map((c) => (
            <li
              key={c.id}
              className="rounded-pill border border-border bg-surface-2 px-3 py-1 text-xs text-text-lo"
              title={`${c.names.en} · ${c.productCount}`}
            >
              {c.names.en} <span className="text-text-dim">({c.productCount})</span>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={submit}
        className="grid gap-3 md:grid-cols-4"
        aria-label={t('admin.catalog.newCategory')}
      >
        {error && (
          <div className="md:col-span-4">
            <Banner tone="error">{error}</Banner>
          </div>
        )}
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={t('admin.catalog.slug')}
          required
          className={fieldClass}
        />
        <input
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          placeholder={t('admin.catalog.nameEn')}
          required
          className={fieldClass}
        />
        <input
          value={nameRu}
          onChange={(e) => setNameRu(e.target.value)}
          placeholder={t('admin.catalog.nameRu')}
          className={fieldClass}
        />
        <Button type="submit" loading={create.isPending}>
          {t('admin.catalog.createCategory')}
        </Button>
      </form>
    </div>
  );
}
