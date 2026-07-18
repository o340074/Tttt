import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stars } from './Stars';
import { useProductReviews } from './api';

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Reviews block on the product page: rating rollup + paginated review list. */
export function ProductReviews({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const query = useProductReviews(slug, page);

  const heading = (
    <h2 className="mb-4 font-body text-lg font-bold text-text-hi">{t('reviews.heading')}</h2>
  );

  if (query.isLoading) {
    return (
      <section className="mt-8">
        {heading}
        <div className="h-28 animate-pulse rounded-lg bg-surface" />
      </section>
    );
  }
  if (query.isError || !query.data) {
    return (
      <section className="mt-8">
        {heading}
        <p className="text-sm text-text-lo">{t('reviews.error')}</p>
      </section>
    );
  }

  const { data: reviews, meta, summary } = query.data;
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.limit));

  return (
    <section className="mt-8" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading" className="mb-4 font-body text-lg font-bold text-text-hi">
        {t('reviews.heading')}
      </h2>

      {summary.count === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-text-lo">
          {t('reviews.empty')}
        </p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-5">
            <div className="text-center">
              <div className="font-display text-4xl font-extrabold text-text-hi tabular-nums">
                {summary.average}
              </div>
              <Stars rating={Number(summary.average)} className="mt-1" />
              <div className="mt-1 text-xs text-text-lo">
                {t('reviews.count', { count: summary.count })}
              </div>
            </div>
            <div className="min-w-[180px] flex-1">
              {[5, 4, 3, 2, 1].map((star) => {
                const n = summary.distribution[star as 1 | 2 | 3 | 4 | 5];
                const pct = summary.count > 0 ? Math.round((n / summary.count) * 100) : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs text-text-lo">
                    <span className="w-3 tabular-nums">{star}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
                      <div
                        className="h-full rounded-pill bg-warning"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right tabular-nums">{n}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <ul className="flex flex-col gap-4">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <Stars rating={review.rating} />
                  <span className="text-xs text-text-dim">
                    {formatDate(review.createdAt, i18n.language)}
                  </span>
                </div>
                {review.title && (
                  <h3 className="font-body text-sm font-semibold text-text-hi">{review.title}</h3>
                )}
                {review.body && <p className="mt-1 text-sm text-text-lo">{review.body}</p>}
                <div className="mt-2 text-xs text-text-dim">{review.authorName}</div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-border-2 px-3 py-1.5 text-sm font-semibold text-text disabled:opacity-40"
              >
                {t('reviews.prev')}
              </button>
              <span className="text-sm text-text-lo">
                {t('reviews.pageOf', { page, total: totalPages })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-border-2 px-3 py-1.5 text-sm font-semibold text-text disabled:opacity-40"
              >
                {t('reviews.next')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
