import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { supportedLocales } from '../../i18n';
import { useAuth } from '../../features/auth/useAuth';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';

interface NavItem {
  to: string;
  labelKey: string;
  icon: IconName;
  /** Match nested routes (detail pages) as active too. */
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/admin/orders', labelKey: 'admin.nav.orders', icon: 'box' },
  { to: '/admin/warming', labelKey: 'admin.nav.warming', icon: 'spark' },
  { to: '/admin/inventory', labelKey: 'admin.nav.inventory', icon: 'shield' },
  { to: '/admin/stock', labelKey: 'admin.nav.stock', icon: 'briefcase' },
];

/** Operator/admin shell (docs/13): fixed sidebar + content outlet, own chrome. */
export function AdminLayout() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen bg-void text-text">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface/60 px-3 py-5 md:flex">
        <Link to="/admin/orders" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="bg-aurora flex h-8 w-8 items-center justify-center rounded-md text-white shadow-glow-volt">
            <Icon name="shield" className="text-[14px]" />
          </span>
          <span className="font-display text-[15px] font-bold tracking-tight text-text-hi">
            {t('admin.title')}
          </span>
        </Link>

        <nav className="flex flex-col gap-1" aria-label={t('admin.title')}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-[140ms] ${
                  isActive
                    ? 'bg-surface-2 text-text-hi'
                    : 'text-text-lo hover:bg-surface-2 hover:text-text-hi'
                }`
              }
            >
              <Icon name={item.icon} className="!h-[17px] !w-[17px]" />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3 px-2 pt-4">
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
                className={`flex-1 rounded-pill px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] transition-colors duration-[140ms] ${
                  i18n.resolvedLanguage === locale
                    ? 'bg-volt text-white'
                    : 'text-text-lo hover:text-text-hi'
                }`}
              >
                {locale}
              </button>
            ))}
          </div>
          <div className="truncate text-xs text-text-dim" title={user?.email}>
            {user?.email}
            <span className="ml-1 rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-lo">
              {user?.role}
            </span>
          </div>
          <Link
            to="/"
            className="flex items-center gap-2 text-xs font-medium text-text-lo transition-colors hover:text-text-hi"
          >
            <Icon name="arrow-left" className="!h-3 !w-3" />
            {t('admin.backToStore')}
          </Link>
        </div>
      </aside>

      {/* Mobile top bar with the same sections. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 overflow-x-auto border-b border-border bg-surface/60 px-4 py-3 md:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${
                  isActive ? 'bg-surface-2 text-text-hi' : 'text-text-lo'
                }`
              }
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </header>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
