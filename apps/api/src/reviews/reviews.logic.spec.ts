import { describe, expect, it } from 'vitest';
import {
  buildDistribution,
  buildSummary,
  computeAverage,
  isReviewableStatus,
  isValidRating,
  maskAuthorName,
} from './reviews.logic';

describe('reviews.logic (E11)', () => {
  it('accepts integer ratings 1..5 and rejects the rest', () => {
    expect([1, 2, 3, 4, 5].every(isValidRating)).toBe(true);
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(3.5)).toBe(false);
    expect(isValidRating(Number.NaN)).toBe(false);
  });

  it('treats only delivered/replaced lines as reviewable', () => {
    expect(isReviewableStatus('delivered')).toBe(true);
    expect(isReviewableStatus('replaced')).toBe(true);
    expect(isReviewableStatus('pending')).toBe(false);
    expect(isReviewableStatus('refunded')).toBe(false);
    expect(isReviewableStatus('queued')).toBe(false);
  });

  it('masks the author email, never leaking the raw address', () => {
    expect(maskAuthorName('ivan@example.com')).toBe('iv***');
    expect(maskAuthorName('a@x.io')).toBe('a***');
    expect(maskAuthorName('')).toBe('user***');
    expect(maskAuthorName('ivan@example.com')).not.toContain('example.com');
  });

  it('computes a two-decimal average or null when empty', () => {
    expect(computeAverage([])).toBeNull();
    expect(computeAverage([5, 4])).toBe('4.50');
    expect(computeAverage([5, 5, 4])).toBe('4.67');
  });

  it('buckets ratings into a 1..5 distribution', () => {
    expect(buildDistribution([5, 5, 4, 1])).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 });
  });

  it('rolls up a full summary', () => {
    const summary = buildSummary([5, 4, 4]);
    expect(summary.count).toBe(3);
    expect(summary.average).toBe('4.33');
    expect(summary.distribution[4]).toBe(2);
  });
});
