import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-6">
        <p className="text-sm text-text-dim">
          © {new Date().getFullYear()} {t('brand.name')}. {t('footer.rights')}
        </p>
        <nav
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
          aria-label={t('footer.legal')}
        >
          <Link to="/legal/terms" className="text-text-dim hover:text-text-hi">
            {t('footer.terms')}
          </Link>
          <Link to="/legal/privacy" className="text-text-dim hover:text-text-hi">
            {t('footer.privacy')}
          </Link>
          <Link to="/legal/refund" className="text-text-dim hover:text-text-hi">
            {t('footer.refund')}
          </Link>
        </nav>
        <p className="text-xs uppercase tracking-[0.08em] text-text-dim">{t('brand.tagline')}</p>
      </div>
    </footer>
  );
}
