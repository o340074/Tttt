import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { supportedLocales } from '../../i18n';
import { useAuth } from '../../features/auth/useAuth';

export function Header() {
  const { t, i18n } = useTranslation();
  const { user, booting } = useAuth();

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
          <NavLink
            to="/catalog"
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm font-medium transition-colors duration-[140ms] ${
                isActive ? 'bg-surface-2 text-text-hi' : 'text-text-lo hover:text-text-hi'
              }`
            }
          >
            {t('nav.catalog')}
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
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

          {!booting &&
            (user ? (
              <Link
                to="/account"
                className="flex items-center gap-2 rounded-pill border border-border bg-surface px-3.5 py-1.5 text-sm font-semibold text-text-hi transition-colors duration-[140ms] hover:border-volt"
              >
                <Icon name="user" className="text-[12px]" />
                {t('nav.account')}
              </Link>
            ) : (
              <Link
                to="/auth/login"
                className="bg-aurora flex items-center gap-2 rounded-pill px-3.5 py-1.5 text-sm font-semibold text-white shadow-glow-volt transition-transform duration-[140ms] hover:-translate-y-px"
              >
                {t('nav.signIn')}
              </Link>
            ))}
        </div>
      </div>
    </header>
  );
}
