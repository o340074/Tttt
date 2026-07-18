import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import type { IconName } from './Icon';

interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'placeholder' | 'className'
> {
  id: string;
  label: string;
  icon: IconName;
  /** Error text below the field; also drives the danger styling. */
  error?: string | null;
  /** Renders the show/hide toggle and switches type password↔text. */
  password?: boolean;
}

/** Floating-label input from the auth prototype (styles: .field/.fl in index.css). */
export function TextField({ id, label, icon, error, password = false, ...rest }: TextFieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const type = password ? (visible ? 'text' : 'password') : (rest.type ?? 'text');

  return (
    <div className={`field mb-4 ${error ? 'err shake' : ''}`}>
      <div className={`fl ${password ? '' : 'no-tog'}`}>
        <input
          {...rest}
          id={id}
          type={type}
          placeholder=" "
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-msg` : undefined}
        />
        <label htmlFor={id}>{label}</label>
        <span className="lead-ic">
          <Icon name={icon} className="text-[14.5px]" />
        </span>
        {password && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-label={visible ? t('auth.fields.hidePassword') : t('auth.fields.showPassword')}
            className="absolute right-1.5 top-1/2 grid h-[34px] w-[34px] -translate-y-1/2 place-items-center rounded-sm text-text-dim transition-colors duration-[140ms] hover:bg-surface-3 hover:text-text-hi"
          >
            <Icon name={visible ? 'eye-off' : 'eye'} className="text-[14.5px]" />
          </button>
        )}
      </div>
      {error && (
        <p
          id={`${id}-msg`}
          className="fade-up mt-1.5 flex items-center gap-1.5 text-[12.5px] text-danger"
        >
          <Icon name="alert" className="text-[11px]" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
