import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { HealthCard } from '../features/health/HealthCard';
import { Icon } from '../components/ui/Icon';
import { ProductCard } from '../features/catalog/ProductCard';
import { useCategories, useProducts } from '../features/catalog/api';
import { catalogIcon } from '../features/catalog/format';
import type { IconName } from '../components/ui/Icon';

const TRUST: { value: string; label: string }[] = [
  { value: '48,200+', label: 'home.trustDelivered' },
  { value: '99.9%', label: 'home.trustUptime' },
  { value: '< 30s', label: 'home.trustDelivery' },
  { value: '4.9★', label: 'home.trustRating' },
];

/** Storefront (prototype/index.html → Storefront): hero, categories, popular. */
export function HomePage() {
  const { t } = useTranslation();
  const categories = useCategories();
  const popular = useProducts({ sort: 'rating', limit: 6 });

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6">
      <section className="relative mb-11 overflow-hidden rounded-xl border border-border px-6 py-12 md:px-10 md:py-16">
        <div className="aurora-field" aria-hidden />
        <div className="relative z-[1] max-w-[620px]">
          <span className="mb-5 inline-flex h-[30px] items-center gap-2 rounded-pill border border-border-2 bg-surface/70 px-3.5 text-[12.5px] font-semibold text-text-hi">
            <Icon name="spark" className="!h-3.5 !w-3.5 text-pulse" />
            {t('home.heroEyebrow')}
          </span>
          <h1 className="mb-4 text-4xl font-extrabold tracking-[-0.02em] md:text-[52px] md:leading-[1.08]">
            {t('home.heroTitle')}
            <br />
            <span className="text-aurora">{t('home.heroTitleAccent')}</span>
          </h1>
          <p className="mb-7 max-w-[500px] text-lg text-text-lo">{t('home.heroSubtitle')}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/catalog"
              className="bg-aurora inline-flex h-[52px] items-center gap-2 rounded-md px-7 text-base font-semibold text-white shadow-glow-volt transition-transform duration-[140ms] hover:-translate-y-px"
            >
              {t('home.browseCatalog')}
              <Icon name="arrow-right" />
            </Link>
            <Link
              to="/auth/register"
              className="inline-flex h-[52px] items-center rounded-md border border-border-2 bg-surface-2 px-7 text-base font-semibold text-text-hi transition-all duration-[140ms] hover:-translate-y-px hover:border-volt"
            >
              {t('home.signUp')}
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap gap-8">
            {TRUST.map(({ value, label }) => (
              <div key={label}>
                <div className="font-display text-[26px] font-extrabold text-text-hi tabular-nums">
                  {value}
                </div>
                <div className="text-[13px] text-text-lo">{t(label)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-11">
        <h2 className="mb-4 text-[13px] font-bold uppercase tracking-[0.12em] text-text-dim">
          {t('home.categoriesHeading')}
        </h2>
        {categories.data && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {categories.data.map((category) => (
              <Link
                key={category.id}
                to={`/catalog?category=${category.slug}`}
                className="rounded-lg border border-border bg-surface p-5 transition-all duration-[180ms] hover:-translate-y-0.5 hover:border-volt hover:shadow-glow-volt"
              >
                <Icon
                  name={catalogIcon(undefined, category.slug) as IconName}
                  className="mb-3 !h-[34px] !w-[34px]"
                />
                <div className="text-[15px] font-bold text-text-hi">{category.name}</div>
                <div className="text-[12.5px] text-text-dim">
                  {t('catalog.offers', { count: category.productCount })}
                </div>
              </Link>
            ))}
          </div>
        )}
        {categories.isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-[118px] animate-pulse rounded-lg bg-surface" />
            ))}
          </div>
        )}
      </section>

      <section className="mb-11">
        <h2 className="mb-4 text-[13px] font-bold uppercase tracking-[0.12em] text-text-dim">
          {t('home.popularHeading')}
        </h2>
        {popular.data && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
            {popular.data.data.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
        {popular.isLoading && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-[290px] animate-pulse rounded-lg bg-surface" />
            ))}
          </div>
        )}
        {popular.isError && <p className="text-sm text-text-lo">{t('catalog.error')}</p>}
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.08em] text-text-dim">
          {t('home.statusHeading')}
        </h2>
        <HealthCard />
      </section>
    </div>
  );
}
