import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { useAuth } from '../features/auth/useAuth';
import { errorKey } from '../features/auth/errors';
import { apiFetch } from '../lib/api';
import { supportedLocales } from '../i18n';
import type { Locale, User } from '@advault/types';

/** Account stub (E1): profile, locale switch, verification state, logout. */
export function AccountPage() {
  const { t, i18n } = useTranslation();
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();

  const [savingLocale, setSavingLocale] = useState<Locale | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null; // guarded route — never happens in practice

  const changeLocale = async (locale: Locale): Promise<void> => {
    if (locale === user.locale || savingLocale) return;
    setSavingLocale(locale);
    setError(null);
    try {
      const updated = await apiFetch<User>('/me', { method: 'PATCH', body: { locale } });
      setUser(updated);
      void i18n.changeLanguage(updated.locale);
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setSavingLocale(null);
    }
  };

  const resendVerification = async (): Promise<void> => {
    setResending(true);
    setError(null);
    try {
      await apiFetch<void>('/auth/resend-verification', { method: 'POST' });
      setResent(true);
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setResending(false);
    }
  };

  const onLogout = async (): Promise<void> => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 md:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold md:text-3xl">{t('account.title')}</h1>
        <Button variant="ghost" loading={loggingOut} onClick={() => void onLogout()}>
          <Icon name="logout" className="text-[14px]" /> {t('account.logout')}
        </Button>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {!user.emailVerifiedAt && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(245,183,64,0.4)] bg-[rgba(245,183,64,0.1)] px-4 py-3.5 text-[13.5px] text-[#ffd98a]">
          <span className="flex items-center gap-2.5">
            <Icon name="alert" className="text-[14px]" />
            {t('account.verifyBanner')}
          </span>
          {resent ? (
            <span className="flex items-center gap-1.5 font-semibold text-success">
              <Icon name="check" className="text-[12px]" /> {t('auth.verify.resent')}
            </span>
          ) : (
            <Button
              variant="secondary"
              loading={resending}
              onClick={() => void resendVerification()}
            >
              <Icon name="refresh" className="text-[13px]" /> {t('auth.verify.resend')}
            </Button>
          )}
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-6 shadow-2">
        <h2 className="mb-5 text-lg font-semibold">{t('account.profile')}</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-dim">
              {t('account.email')}
            </dt>
            <dd className="flex items-center gap-2 text-[15px] font-medium text-text-hi">
              {user.email}
              {user.emailVerifiedAt && (
                <span
                  className="inline-flex items-center gap-1 rounded-pill border border-[rgba(43,217,166,0.4)] bg-[rgba(43,217,166,0.12)] px-2 py-0.5 text-[11px] font-semibold text-success"
                  title={t('account.verified')}
                >
                  <Icon name="check" className="text-[9px]" /> {t('account.verified')}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-dim">
              {t('account.role')}
            </dt>
            <dd className="text-[15px] font-medium text-text-hi">
              {t(`account.roles.${user.role}`)}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-dim">
              {t('account.balance')}
            </dt>
            <dd className="font-mono text-[15px] font-medium text-text-hi">
              ${user.balance} {user.currency}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-dim">
              {t('account.memberSince')}
            </dt>
            <dd className="text-[15px] font-medium text-text-hi">
              {new Date(user.createdAt).toLocaleDateString(i18n.resolvedLanguage)}
            </dd>
          </div>
        </dl>

        <hr className="my-6 border-border" />

        <h3 className="mb-3 text-sm font-semibold text-text-hi">{t('account.language')}</h3>
        <div
          className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-2 p-1"
          role="group"
          aria-label={t('account.language')}
        >
          {supportedLocales.map((locale) => (
            <button
              key={locale}
              type="button"
              disabled={savingLocale !== null}
              onClick={() => void changeLocale(locale)}
              aria-pressed={user.locale === locale}
              className={`rounded-pill px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition-colors duration-[140ms] disabled:opacity-60 ${
                user.locale === locale ? 'bg-volt text-white' : 'text-text-lo hover:text-text-hi'
              }`}
            >
              {savingLocale === locale ? '…' : locale}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-text-dim">{t('account.languageHint')}</p>
      </section>
    </div>
  );
}
