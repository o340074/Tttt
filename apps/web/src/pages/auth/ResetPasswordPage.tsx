import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { PasswordStrength } from '../../features/auth/PasswordStrength';
import { errorKey } from '../../features/auth/errors';
import { apiFetch } from '../../lib/api';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBanner(null);
    const errors: Record<string, string> = {};
    if (password.length < 8) errors.password = t('auth.fields.passwordTooShort');
    if (confirm !== password || !confirm) errors.confirm = t('auth.fields.passwordsMismatch');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      await apiFetch<void>('/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: password },
        anonymous: true,
      });
      setDone(true);
    } catch (error) {
      setBanner(t(errorKey(error)));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token || done) {
    return (
      <section aria-label={t('auth.reset.title')} className="text-center">
        <Banner tone={done ? 'success' : 'error'}>
          {done ? t('auth.reset.success') : t('errors.INVALID_TOKEN')}
        </Banner>
        <Link to="/auth/login">
          <Button block>{t('auth.backToLogin')}</Button>
        </Link>
      </section>
    );
  }

  return (
    <section aria-label={t('auth.reset.title')}>
      <div className="mb-5">
        <h2 className="mb-1.5 text-[23px] font-bold">{t('auth.reset.title')}</h2>
        <p className="text-sm text-text-lo">{t('auth.reset.subtitle')}</p>
      </div>

      {banner && <Banner tone="error">{banner}</Banner>}

      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <TextField
          id="new-password"
          label={t('auth.fields.newPassword')}
          icon="lock"
          password
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors(({ password: _p, ...rest }) => rest);
          }}
          error={fieldErrors.password}
        />
        <PasswordStrength value={password} />
        <TextField
          id="confirm-password"
          label={t('auth.fields.confirmNewPassword')}
          icon="lock"
          password
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setFieldErrors(({ confirm: _c, ...rest }) => rest);
          }}
          error={fieldErrors.confirm}
        />
        <Button type="submit" block loading={submitting}>
          {t('auth.reset.submit')}
        </Button>
      </form>
    </section>
  );
}
