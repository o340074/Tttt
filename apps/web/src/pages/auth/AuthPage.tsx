import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../features/auth/useAuth';
import { PasswordStrength } from '../../features/auth/PasswordStrength';
import { EMAIL_RE, errorKey } from '../../features/auth/errors';
import type { Locale } from '@advault/types';

interface AuthPageProps {
  view: 'login' | 'register';
}

/** Login + register — one card with the segmented switch from the prototype. */
export function AuthPage({ view }: AuthPageProps) {
  const { t, i18n } = useTranslation();
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = view === 'register';

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!EMAIL_RE.test(email)) errors.email = t('auth.fields.emailInvalid');
    if (isRegister) {
      if (password.length < 8) errors.password = t('auth.fields.passwordTooShort');
      if (confirm !== password || !confirm) errors.confirm = t('auth.fields.passwordsMismatch');
    } else if (!password) {
      errors.password = t('auth.fields.passwordRequired');
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBanner(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (isRegister) {
        await register({ email, password, locale: (i18n.resolvedLanguage as Locale) ?? 'en' });
        navigate('/auth/verify', { state: { email } });
      } else {
        await login({ email, password });
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from ?? '/account', { replace: true });
      }
    } catch (error) {
      setBanner(t(errorKey(error)));
    } finally {
      setSubmitting(false);
    }
  };

  const clearFieldError = (field: string): void =>
    setFieldErrors(({ [field]: _removed, ...rest }) => rest);

  return (
    <section aria-label={t(isRegister ? 'auth.register.title' : 'auth.login.title')}>
      {/* Segmented login/register switch */}
      <div
        className="relative mb-6 flex gap-1 rounded-md border border-border bg-surface-2 p-1"
        role="tablist"
        aria-label={t('auth.switchLabel')}
      >
        <span
          aria-hidden
          className={`absolute bottom-1 top-1 w-[calc(50%-6px)] rounded-sm border border-border-2 bg-surface-3 shadow-2 transition-transform duration-300 ${
            isRegister ? 'translate-x-[calc(100%+4px)]' : ''
          }`}
        />
        <Link
          role="tab"
          aria-selected={!isRegister}
          to="/auth/login"
          className={`relative z-[1] flex h-[38px] flex-1 items-center justify-center rounded-sm text-sm font-semibold transition-colors ${!isRegister ? 'text-text-hi' : 'text-text-lo hover:text-text-hi'}`}
        >
          {t('auth.login.tab')}
        </Link>
        <Link
          role="tab"
          aria-selected={isRegister}
          to="/auth/register"
          className={`relative z-[1] flex h-[38px] flex-1 items-center justify-center rounded-sm text-sm font-semibold transition-colors ${isRegister ? 'text-text-hi' : 'text-text-lo hover:text-text-hi'}`}
        >
          {t('auth.register.tab')}
        </Link>
      </div>

      <div className="mb-5">
        <h2 className="mb-1.5 text-[23px] font-bold">
          {t(isRegister ? 'auth.register.title' : 'auth.login.title')}
        </h2>
        <p className="text-sm text-text-lo">
          {t(isRegister ? 'auth.register.subtitle' : 'auth.login.subtitle')}
        </p>
      </div>

      {banner && <Banner tone="error">{banner}</Banner>}

      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <TextField
          id="email"
          label={t('auth.fields.email')}
          icon="mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError('email');
          }}
          error={fieldErrors.email}
        />
        <TextField
          id="password"
          label={t('auth.fields.password')}
          icon="lock"
          password
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearFieldError('password');
          }}
          error={fieldErrors.password}
        />
        {isRegister && (
          <>
            <PasswordStrength value={password} />
            <TextField
              id="confirm"
              label={t('auth.fields.confirmPassword')}
              icon="lock"
              password
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                clearFieldError('confirm');
              }}
              error={fieldErrors.confirm}
            />
          </>
        )}

        {!isRegister && (
          <div className="mb-4 flex justify-end">
            <Link
              to="/auth/forgot"
              className="text-[13.5px] font-semibold text-volt-400 transition-colors hover:text-pulse"
            >
              {t('auth.login.forgot')}
            </Link>
          </div>
        )}

        <Button type="submit" block loading={submitting}>
          {t(isRegister ? 'auth.register.submit' : 'auth.login.submit')}
        </Button>
      </form>

      <p className="mt-4 text-center text-[13.5px] text-text-lo">
        {t(isRegister ? 'auth.register.haveAccount' : 'auth.login.noAccount')}{' '}
        <Link
          to={isRegister ? '/auth/login' : '/auth/register'}
          className="font-semibold text-volt-400 transition-colors hover:text-pulse"
        >
          {t(isRegister ? 'auth.register.toLogin' : 'auth.login.toRegister')}
        </Link>
      </p>
    </section>
  );
}
