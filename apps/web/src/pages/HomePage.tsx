import { useTranslation } from 'react-i18next';
import { HealthCard } from '../features/health/HealthCard';

export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-16 md:px-6 md:py-24">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-[-0.02em] md:text-5xl">
          <span className="text-aurora">{t('home.heroTitle')}</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-text-lo">{t('home.heroSubtitle')}</p>
      </section>

      <section className="mt-14">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.08em] text-text-dim">
          {t('home.statusHeading')}
        </h2>
        <HealthCard />
      </section>
    </div>
  );
}
