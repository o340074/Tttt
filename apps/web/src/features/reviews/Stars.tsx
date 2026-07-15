import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui/Icon';

/** Read-only star rating (rounded to the nearest whole star). */
export function Stars({ rating, className = '' }: { rating: number; className?: string }) {
  const { t } = useTranslation();
  const rounded = Math.round(rating);
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="img"
      aria-label={t('reviews.starsAria', { rating: rating.toFixed(1) })}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star"
          className={`!h-3.5 !w-3.5 ${n <= rounded ? 'text-warning' : 'text-border-2'}`}
        />
      ))}
    </span>
  );
}

/** Interactive 1..5 star picker (radiogroup). */
export function StarInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label={t('reviews.ratingLabel')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={t('reviews.nStars', { count: n })}
          onClick={() => onChange(n)}
          className="rounded p-0.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-volt"
        >
          <Icon
            name="star"
            className={`!h-6 !w-6 ${n <= value ? 'text-warning' : 'text-border-2'}`}
          />
        </button>
      ))}
    </div>
  );
}
