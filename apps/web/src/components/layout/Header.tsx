import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { supportedLocales } from '../../i18n';

export function Header() {
  const { t, i18n } = useTranslation();

  return (
    <header className="sticky top-0 z-[100] border-b border-border bg-void/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2.5" aria-label={t('brand.name')}>
          <span className="bg-aurora flex h-9 w-9 items-center justify-center rounded-md text-white shadow-glow-volt">
            <Icon name="shield" className="text-[16px]" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-text-hi">
            {t('brand.name')}
          </span>
        </Link>

        <nav className="flex items-center gap-1" aria-label={t('nav.home')}>
          <NavLink
            to="/"
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm font-medium transition-colors duration-[140ms] ${
                isActive ? 'bg-surface-2 text-text-hi' : 'text-text-lo hover:text-text-hi'
              }`
            }
          >
            {t('nav.home')}
          </NavLink>
        </nav>

        <div
          className="flex items-center gap-1 rounded-pill border border-border bg-surface p-1"
          role="group"
          aria-label={t('nav.language')}
        >
          {supportedLocales.map((locale) => (
            <button
              key={locale}
              type="button"
              onClick={() => void i18n.changeLanguage(locale)}
              aria-pressed={i18n.resolvedLanguage === locale}
              className={`rounded-pill px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] transition-colors duration-[140ms] ${
                i18n.resolvedLanguage === locale
                  ? 'bg-volt text-white'
                  : 'text-text-lo hover:text-text-hi'
              }`}
            >
              {locale}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
