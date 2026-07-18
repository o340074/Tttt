import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Stars } from '../../features/reviews/Stars';
import { useAdminReviews, useModerateReview } from '../../features/reviews/api';

type VisibilityFilter = 'all' | 'visible' | 'hidden';

const FILTERS: VisibilityFilter[] = ['all', 'visible', 'hidden'];

/** Review moderation queue (E11): hide/restore abusive reviews. */
export function AdminReviewsPage() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<VisibilityFilter>('all');
  const limit = 20;

  const hidden = filter === 'all' ? undefined : filter === 'hidden';
  const reviews = useAdminReviews(page, hidden);
  const moderate = useModerateReview();
  const totalPages = reviews.data ? Math.max(1, Math.ceil(reviews.data.meta.total / limit)) : 1;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-8">
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold">{t('admin.reviews.title')}</h1>
        <p className="text-sm text-text-lo">{t('admin.reviews.subtitle')}</p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
            aria-pressed={filter === f}
            className={`rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f
                ? 'bg-volt text-white'
                : 'border border-border bg-surface text-text-lo hover:text-text-hi'
            }`}
          >
            {t(`admin.reviews.filters.${f}`)}
          </button>
        ))}
      </div>

      {moderate.isError && (
        <Banner tone="error" className="mb-4">
          {t('admin.reviews.moderateError')}
        </Banner>
      )}

      {reviews.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : reviews.isError ? (
        <>
          <Banner tone="error">{t('admin.reviews.error')}</Banner>
          <Button variant="secondary" onClick={() => void reviews.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : reviews.data!.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="star" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.reviews.empty')}</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {reviews.data!.data.map((r) => (
              <li
                key={r.id}
                className={`rounded-xl border border-border bg-surface p-4 ${r.hidden ? 'opacity-60' : ''}`}
              >
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="text-sm font-semibold text-text-hi">{r.productName}</span>
                    {r.hidden && (
                      <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-dim">
                        {t('admin.reviews.hiddenTag')}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    className="!h-8 !px-3 text-xs"
                    loading={moderate.isPending && moderate.variables?.id === r.id}
                    onClick={() => moderate.mutate({ id: r.id, hidden: !r.hidden })}
                  >
                    {r.hidden ? t('admin.reviews.restore') : t('admin.reviews.hide')}
                  </Button>
                </div>
                {r.title && <div className="text-sm font-semibold text-text-hi">{r.title}</div>}
                {r.body && <p className="mt-1 text-sm text-text-lo">{r.body}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-dim">
                  <span>{r.authorEmail}</span>
                  <span>·</span>
                  <span>
                    {new Date(r.createdAt).toLocaleDateString(i18n.resolvedLanguage, {
                      dateStyle: 'medium',
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav
              className="mt-5 flex items-center justify-center gap-3"
              aria-label={t('admin.pagination')}
            >
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="arrow-left" className="!h-3 !w-3" /> {t('admin.prev')}
              </Button>
              <span className="text-[13px] tabular-nums text-text-lo">
                {t('admin.page', { page, total: totalPages })}
              </span>
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('admin.next')} <Icon name="arrow-right" className="!h-3 !w-3" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
