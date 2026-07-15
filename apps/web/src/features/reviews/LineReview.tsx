import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { errorKey } from '../auth/errors';
import { Stars, StarInput } from './Stars';
import { useCreateReview } from './api';
import type { OrderItem } from '@advault/types';

/**
 * Review control for a delivered order line (E11). Shows the buyer's existing
 * review, or — when the line is reviewable — a compact star + text form. Hidden
 * entirely when the line is not eligible (never delivered, no product).
 */
export function LineReview({ item }: { item: OrderItem }) {
  const { t } = useTranslation();
  const review = item.review ?? null;
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const create = useCreateReview();

  if (!review) return null;

  if (review.myReview) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-lo">
        <Icon name="check" className="!h-4 !w-4 text-success" />
        {t('reviews.yourRating')}
        <Stars rating={review.myReview.rating} className="ml-1" />
      </div>
    );
  }

  if (!review.canReview) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-volt-400 hover:text-text-hi"
      >
        <Icon name="star" className="!h-4 !w-4" />
        {t('reviews.leaveReview')}
      </button>
    );
  }

  const submit = (): void => {
    if (rating < 1) return;
    create.mutate({
      orderItemId: item.id,
      rating,
      title: title.trim() || undefined,
      body: body.trim() || undefined,
    });
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-surface-2 p-4">
      <div className="mb-2 text-[13px] font-semibold text-text-hi">{t('reviews.formHeading')}</div>
      {create.isError && (
        <Banner tone="error" className="mb-3">
          {t(errorKey(create.error))}
        </Banner>
      )}
      <StarInput value={rating} onChange={setRating} />
      <input
        type="text"
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('reviews.titlePlaceholder')}
        aria-label={t('reviews.titlePlaceholder')}
        className="mt-3 w-full rounded-md border border-border-2 bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-volt focus:outline-none"
      />
      <textarea
        value={body}
        maxLength={2000}
        rows={3}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('reviews.bodyPlaceholder')}
        aria-label={t('reviews.bodyPlaceholder')}
        className="mt-2 w-full resize-y rounded-md border border-border-2 bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-volt focus:outline-none"
      />
      <div className="mt-3 flex items-center gap-2">
        <Button loading={create.isPending} disabled={rating < 1} onClick={submit}>
          {t('reviews.submit')}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[13px] font-semibold text-text-lo hover:text-text-hi"
        >
          {t('reviews.cancel')}
        </button>
      </div>
    </div>
  );
}
