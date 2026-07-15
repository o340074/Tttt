import { describe, expect, it } from 'vitest';
import {
  computeWindow,
  generateClaimNumber,
  hasOpenClaim,
  isClaimEligible,
} from './warranty.logic';

const HOUR = 3_600_000;

describe('warranty.logic (E10)', () => {
  it('computes the window end as deliveredAt + warrantyHours', () => {
    const delivered = new Date('2026-07-01T00:00:00.000Z');
    const w = computeWindow(delivered, 48, new Date('2026-07-02T00:00:00.000Z'));
    expect(w.expiresAt?.toISOString()).toBe('2026-07-03T00:00:00.000Z');
    expect(w.withinWindow).toBe(true);
  });

  it('is outside the window once warrantyHours have elapsed', () => {
    const delivered = new Date('2026-07-01T00:00:00.000Z');
    const now = new Date(delivered.getTime() + 49 * HOUR);
    expect(computeWindow(delivered, 48, now).withinWindow).toBe(false);
  });

  it('treats the exact expiry instant as still inside the window', () => {
    const delivered = new Date('2026-07-01T00:00:00.000Z');
    const now = new Date(delivered.getTime() + 48 * HOUR);
    expect(computeWindow(delivered, 48, now).withinWindow).toBe(true);
  });

  it('has no window without a delivery or without warranty', () => {
    expect(computeWindow(null, 48).withinWindow).toBe(false);
    expect(computeWindow(new Date(), null).withinWindow).toBe(false);
    expect(computeWindow(new Date(), 0).withinWindow).toBe(false);
  });

  it('is eligible for a delivered, in-window line with no open claim', () => {
    expect(
      isClaimEligible({
        deliveryStatus: 'delivered',
        deliveredAt: new Date(),
        warrantyHours: 72,
        existingClaimStatuses: [],
      }),
    ).toBe(true);
  });

  it('allows a claim on a replaced line (the new asset carries a fresh window)', () => {
    expect(
      isClaimEligible({
        deliveryStatus: 'replaced',
        deliveredAt: new Date(),
        warrantyHours: 72,
        existingClaimStatuses: ['replaced'],
      }),
    ).toBe(true);
  });

  it('blocks a second claim while one is requested or approved', () => {
    for (const open of ['requested', 'approved'] as const) {
      expect(
        isClaimEligible({
          deliveryStatus: 'delivered',
          deliveredAt: new Date(),
          warrantyHours: 72,
          existingClaimStatuses: [open],
        }),
      ).toBe(false);
    }
  });

  it('is not eligible for a non-delivered, refunded or expired line', () => {
    const base = { deliveredAt: new Date(), warrantyHours: 72, existingClaimStatuses: [] };
    expect(isClaimEligible({ ...base, deliveryStatus: 'queued' })).toBe(false);
    expect(isClaimEligible({ ...base, deliveryStatus: 'refunded' })).toBe(false);
    expect(
      isClaimEligible({
        deliveryStatus: 'delivered',
        deliveredAt: new Date(Date.now() - 100 * HOUR),
        warrantyHours: 72,
        existingClaimStatuses: [],
      }),
    ).toBe(false);
  });

  it('detects an open claim among mixed statuses', () => {
    expect(hasOpenClaim(['rejected', 'requested'])).toBe(true);
    expect(hasOpenClaim(['rejected', 'refunded', 'replaced'])).toBe(false);
  });

  it('generates a WC-YYYY-NNNNNN number', () => {
    expect(generateClaimNumber(new Date('2026-07-15T00:00:00Z'))).toMatch(/^WC-2026-\d{6}$/);
  });
});
