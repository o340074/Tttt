import { useTranslation } from 'react-i18next';
import { scorePassword } from './password-score';

const LEVEL_COLORS = ['', 'bg-danger', 'bg-warning', 'bg-beam', 'bg-success'];
const LEVEL_TEXT = ['', 'text-danger', 'text-warning', 'text-beam', 'text-success'];

export function PasswordStrength({ value }: { value: string }) {
  const { t } = useTranslation();
  if (!value) return null;
  const level = scorePassword(value);
  return (
    <div className="fade-up -mt-1 mb-4" aria-live="polite">
      <div className="mb-1.5 flex gap-1.5">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={`h-[5px] flex-1 rounded-[3px] transition-colors duration-[220ms] ${
              bar <= level ? LEVEL_COLORS[level] : 'bg-surface-3'
            }`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-text-lo">
        <span>{t('auth.strength.label')}</span>
        <b className={`font-semibold ${LEVEL_TEXT[level]}`}>{t(`auth.strength.l${level}`)}</b>
      </div>
    </div>
  );
}
