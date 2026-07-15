import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';

export type LegalDoc = 'tos' | 'privacy' | 'refund';

interface LegalSection {
  heading: string;
  body: string;
}

/**
 * Static legal page (ToS / Privacy / Refund) — content lives in the i18n
 * bundles under `legal.<doc>.*` (EN/RU). The copy is a template and is not legal
 * advice (docs/09): the disclaimer says so and points to a required review.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t } = useTranslation();
  const sections = t(`legal.${doc}.sections`, { returnObjects: true }) as LegalSection[];

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 py-12 md:px-6">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-text-lo hover:text-text-hi"
      >
        <Icon name="arrow-left" className="!h-4 !w-4" /> {t('legal.backHome')}
      </Link>
      <h1 className="mb-2 text-3xl font-bold">{t(`legal.${doc}.title`)}</h1>
      <p className="mb-6 text-sm text-text-dim">{t('legal.lastUpdated', { date: '2026-07-15' })}</p>

      <div className="mb-8 rounded-lg border border-[rgba(76,178,255,0.4)] bg-[rgba(76,178,255,0.1)] px-4 py-3 text-[13px] text-[#bfe1ff]">
        {t('legal.disclaimer')}
      </div>

      <div className="flex flex-col gap-6">
        {Array.isArray(sections) &&
          sections.map((section, index) => (
            <section key={index}>
              <h2 className="mb-2 font-body text-lg font-bold text-text-hi">{section.heading}</h2>
              <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-text-lo">
                {section.body}
              </p>
            </section>
          ))}
      </div>
    </div>
  );
}
