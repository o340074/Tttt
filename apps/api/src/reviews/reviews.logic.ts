import type { OrderItemDeliveryStatus, ReviewSummary } from '@advault/types';

/** Allowed rating range (inclusive). */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** A line can be reviewed once its data has actually been handed over. */
const REVIEWABLE_STATUSES: OrderItemDeliveryStatus[] = ['delivered', 'replaced'];

export function isReviewableStatus(status: OrderItemDeliveryStatus): boolean {
  return REVIEWABLE_STATUSES.includes(status);
}

export function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= RATING_MIN && rating <= RATING_MAX;
}

/**
 * Mask a reviewer's email into a public label — never expose the raw address.
 * "ivan@x.io" → "iv***", short/edge local parts degrade gracefully.
 */
export function maskAuthorName(email: string): string {
  const local = email.split('@')[0] ?? '';
  if (local.length <= 2) return `${local || 'user'}***`;
  return `${local.slice(0, 2)}***`;
}

/** Two-decimal mean of the ratings, or null when there are none. */
export function computeAverage(ratings: number[]): string | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((acc, r) => acc + r, 0);
  return (sum / ratings.length).toFixed(2);
}

/** Count of reviews per star bucket (1..5). */
export function buildDistribution(ratings: number[]): ReviewSummary['distribution'] {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) {
    if (r >= RATING_MIN && r <= RATING_MAX) dist[r as 1 | 2 | 3 | 4 | 5] += 1;
  }
  return dist;
}

/** Roll up visible ratings into the product summary. */
export function buildSummary(ratings: number[]): ReviewSummary {
  return {
    average: computeAverage(ratings),
    count: ratings.length,
    distribution: buildDistribution(ratings),
  };
}
