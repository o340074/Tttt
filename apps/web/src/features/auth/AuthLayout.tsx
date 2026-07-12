import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui/Icon';

/** Centered card over the aurora field — frame for every auth screen. */
export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="relative min-h-screen overflow-hidden bg-void">
      <div className="aurora-field" aria-hidden />
      <main className="relative z-[1] grid min-h-screen place-items-center px-5 py-10">
        <div className="w-full max-w-[428px]">
          <Link
            to="/"
            className="mb-5 flex items-center justify-center gap-2.5 font-display text-2xl font-bold tracking-tight text-text-hi"
            aria-label={t('brand.name')}
          >
            <span className="bg-aurora flex h-10 w-10 items-center justify-center rounded-md text-white shadow-glow-volt">
              <Icon name="shield" className="text-[17px]" />
            </span>
            <span>
              Ad<span className="text-aurora">Vault</span>
            </span>
          </Link>
          <div className="auth-card px-[30px] py-[26px] max-[480px]:px-5">
            <Outlet />
          </div>
          <p className="mt-4 text-center text-[11.5px] leading-relaxed text-text-dim">
            {t('auth.fine')}
          </p>
        </div>
      </main>
    </div>
  );
}
