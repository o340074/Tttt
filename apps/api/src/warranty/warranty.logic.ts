import type { OrderItemDeliveryStatus, WarrantyClaimStatus } from '@advault/types';

/** Line delivery states from which a buyer may still open a warranty claim: a
 *  delivered line, or one already replaced under an earlier claim (the new asset
 *  carries its own fresh window). Refunded lines are settled — no claim. */
const CLAIMABLE_DELIVERY_STATES: OrderItemDeliveryStatus[] = ['delivered', 'replaced'];

/** Claim statuses that still occupy the line — a second claim is blocked while
 *  one of these is open (docs/14: one active claim per line at a time). */
const OPEN_CLAIM_STATES: WarrantyClaimStatus[] = ['requested', 'approved'];

export interface WarrantyWindow {
  /** Window start = the latest delivery time; null if never delivered. */
  deliveredAt: Date | null;
  /** Window end = deliveredAt + warrantyHours; null when either is missing. */
  expiresAt: Date | null;
  /** True while `now` is at or before `expiresAt`. */
  withinWindow: boolean;
}

/**
 * Compute the warranty window for a delivered line. The window runs
 * `warrantyHours` from `deliveredAt`; with no warranty (null hours) or no
 * delivery there is no window and nothing is claimable.
 */
export function computeWindow(
  deliveredAt: Date | null,
  warrantyHours: number | null,
  now: Date = new Date(),
): WarrantyWindow {
  if (!deliveredAt || warrantyHours == null || warrantyHours <= 0) {
    return { deliveredAt, expiresAt: null, withinWindow: false };
  }
  const expiresAt = new Date(deliveredAt.getTime() + warrantyHours * 3_600_000);
  return { deliveredAt, expiresAt, withinWindow: now.getTime() <= expiresAt.getTime() };
}

export interface EligibilityInput {
  deliveryStatus: OrderItemDeliveryStatus;
  deliveredAt: Date | null;
  warrantyHours: number | null;
  /** Statuses of any existing claims on this line. */
  existingClaimStatuses: WarrantyClaimStatus[];
  now?: Date;
}

/** A buyer may open a claim only for a claimable, in-window line that has no
 *  already-open claim. Pure — the service maps `false` to the right 4xx. */
export function isClaimEligible(input: EligibilityInput): boolean {
  if (!CLAIMABLE_DELIVERY_STATES.includes(input.deliveryStatus)) return false;
  if (input.existingClaimStatuses.some((s) => OPEN_CLAIM_STATES.includes(s))) return false;
  const window = computeWindow(input.deliveredAt, input.warrantyHours, input.now);
  return window.withinWindow;
}

/** True when the line already carries an open (requested/approved) claim. */
export function hasOpenClaim(statuses: WarrantyClaimStatus[]): boolean {
  return statuses.some((s) => OPEN_CLAIM_STATES.includes(s));
}

/** WC-YYYY-NNNNNN — human-readable warranty claim number. */
export function generateClaimNumber(now: Date = new Date()): string {
  const year = now.getFullYear();
  const n = Math.floor(Math.random() * 1_000_000);
  return `WC-${year}-${String(n).padStart(6, '0')}`;
}
