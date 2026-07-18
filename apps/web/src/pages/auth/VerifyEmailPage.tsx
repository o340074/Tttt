import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../features/auth/useAuth';
import { errorKey } from '../../features/auth/errors';
import { apiFetch } from '../../lib/api';
import type { User } from '@advault/types';

type VerifyState = 'verifying' | 'success' | 'error';

/**
 * Two modes: with ?token= it confirms the email; without it shows the
 * «check your inbox» screen after registration (email in location.state).
 */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const location = useLocation();
  const { user, setUser } = useAuth();

  const token = params.get('token');
  const sentTo = (location.state as { email?: string } | null)?.email ?? user?.email;

  const [state, setState] = useState<VerifyState>('verifying');
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // StrictMode double-run guard: the token is single-use
    void (async () => {
      try {
        await apiFetch<void>('/auth/verify-email', {
          method: 'POST',
          body: { token },
          anonymous: true,
        });
        setState('success');
        // Refresh the cached profile if the visitor is signed in.
        try {
          setUser(await apiFetch<User>('/me'));
        } catch {
          /* signed out — nothing to refresh */
        }
      } catch {
        setState('error');
      }
    })();
  }, [token, setUser]);

  const resend = async (): Promise<void> => {
    setResending(true);
    setResendError(null);
    try {
      await apiFetch<void>('/auth/resend-verification', { method: 'POST' });
      setResent(true);
    } catch (error) {
      setResendError(t(errorKey(error)));
    } finally {
      setResending(false);
    }
  };

  // ---- Mode 1: link from the email ----
  if (token) {
    return (
      <section aria-label={t('auth.verify.title')} className="text-center">
        <div className="mx-auto mb-4 grid h-[74px] w-[74px] place-items-center rounded-lg border border-border-2 bg-surface-2">
          <Icon
            name={state === 'error' ? 'alert' : state === 'success' ? 'check' : 'mail'}
            className={`text-[26px] ${state === 'success' ? 'text-success' : state === 'error' ? 'text-danger' : 'text-text-lo'}`}
          />
        </div>
        {state === 'verifying' && (
          <p className="mb-5 text-sm text-text-lo" role="status">
            {t('auth.verify.checking')}
          </p>
        )}
        {state === 'success' && (
          <>
            <h2 className="mb-1.5 text-[23px] font-bold">{t('auth.verify.successTitle')}</h2>
            <p className="mb-5 text-sm text-text-lo">{t('auth.verify.successText')}</p>
            <Link to={user ? '/account' : '/auth/login'}>
              <Button block>
                {t(user ? 'auth.verify.toAccount' : 'auth.backToLogin')}{' '}
                <Icon name="arrow-right" className="text-[13px]" />
              </Button>
            </Link>
          </>
        )}
        {state === 'error' && (
          <>
            <Banner tone="error">{t('errors.INVALID_TOKEN')}</Banner>
            <Link to={user ? '/account' : '/auth/login'}>
              <Button variant="secondary" block>
                {t(user ? 'auth.verify.toAccount' : 'auth.backToLogin')}
              </Button>
            </Link>
          </>
        )}
      </section>
    );
  }

  // ---- Mode 2: «check your email» after registration ----
  return (
    <section aria-label={t('auth.verify.title')} className="text-center">
      <div className="mx-auto mb-4 grid h-[74px] w-[74px] place-items-center rounded-lg border border-border-2 bg-surface-2">
        <Icon name="mail" className="text-[26px] text-text-lo" />
      </div>
      <h2 className="mb-1.5 text-[23px] font-bold">{t('auth.verify.title')}</h2>
      <p className="text-sm text-text-lo">{t('auth.verify.sentTo')}</p>
      {sentTo && (
        <span className="mt-1 inline-block rounded-pill border border-border bg-surface-2 px-3.5 py-1 text-[13.5px] font-semibold text-text-hi">
          {sentTo}
        </span>
      )}
      <p className="mt-3 text-[13px] text-text-dim">{t('auth.verify.hint')}</p>

      {resendError && (
        <div className="mt-4">
          <Banner tone="error">{resendError}</Banner>
        </div>
      )}
      {resent && (
        <div className="mt-4">
          <Banner tone="success">{t('auth.verify.resent')}</Banner>
        </div>
      )}

      <div className="mt-5 grid gap-2.5">
        {user && (
          <Button variant="secondary" block loading={resending} onClick={() => void resend()}>
            <Icon name="refresh" className="text-[13px]" /> {t('auth.verify.resend')}
          </Button>
        )}
        <Link to={user ? '/account' : '/auth/login'}>
          <Button variant="ghost" block>
            {t(user ? 'auth.verify.toAccount' : 'auth.backToLogin')}
          </Button>
        </Link>
      </div>
    </section>
  );
}
