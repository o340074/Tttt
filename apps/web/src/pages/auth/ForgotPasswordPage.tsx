import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { TextField } from '../../components/ui/TextField';
import { EMAIL_RE, errorKey } from '../../features/auth/errors';
import { apiFetch } from '../../lib/api';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBanner(null);
    if (!EMAIL_RE.test(email)) {
      setFieldError(t('auth.fields.emailInvalid'));
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch<void>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
        anonymous: true,
      });
      setBanner({ tone: 'info', text: t('auth.forgot.sent') });
    } catch (error) {
      setBanner({ tone: 'error', text: t(errorKey(error)) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-label={t('auth.forgot.title')}>
      <div className="mb-5">
        <Link
          to="/auth/login"
          className="mb-3.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-text-lo transition-colors hover:text-text-hi"
        >
          <Icon name="arrow-left" className="text-[11px]" /> {t('auth.backToLogin')}
        </Link>
        <h2 className="mb-1.5 text-[23px] font-bold">{t('auth.forgot.title')}</h2>
        <p className="text-sm text-text-lo">{t('auth.forgot.subtitle')}</p>
      </div>

      {banner && <Banner tone={banner.tone}>{banner.text}</Banner>}

      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <TextField
          id="forgot-email"
          label={t('auth.fields.email')}
          icon="mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldError(null);
          }}
          error={fieldError}
        />
        <Button type="submit" block loading={submitting}>
          {t('auth.forgot.submit')}
        </Button>
      </form>

      <p className="mt-4 text-center text-[13.5px] text-text-lo">
        {t('auth.forgot.remembered')}{' '}
        <Link
          to="/auth/login"
          className="font-semibold text-volt-400 transition-colors hover:text-pulse"
        >
          {t('auth.login.tab')}
        </Link>
      </p>
    </section>
  );
}
