import { Prisma } from '@prisma/client';

/**
 * One order line reduced to what refund allocation needs: its id and its gross
 * subtotal (unitPrice × quantity), a 2-dp Money Decimal.
 */
export interface RefundLine {
  id: string;
  subtotal: Prisma.Decimal;
}

/** 2-dp Money Decimal → integer cents (BigInt, exact — inputs are already 2-dp). */
function toCents(value: Prisma.Decimal): bigint {
  return BigInt(value.times(100).toFixed(0));
}

/** Integer cents (BigInt) → 2-dp Money Decimal. */
function fromCents(cents: bigint): Prisma.Decimal {
  return new Prisma.Decimal(cents.toString()).dividedBy(100);
}

/**
 * Allocate an order-level promo discount across its lines proportionally to each
 * line's subtotal, using the largest-remainder (Hamilton) method so that:
 *
 * - the per-line allocations sum to **exactly** the discount — not a cent more or
 *   less, so nothing is created or lost when lines are refunded separately;
 * - each line's share is **deterministic and stable** — it does not depend on
 *   which line is refunded first, so partial refunds over time never drift.
 *
 * Returns a map of lineId → allocated discount (2-dp Decimal, ≥ 0). A zero or
 * absent discount, or an all-zero order, yields zero for every line (so a refund
 * simply credits the full line subtotal, the pre-discount behaviour).
 */
export function allocateDiscount(
  lines: RefundLine[],
  discount: Prisma.Decimal,
): Map<string, Prisma.Decimal> {
  const result = new Map<string, Prisma.Decimal>();
  const cents = lines.map((l) => toCents(l.subtotal));
  const total = cents.reduce((sum, c) => sum + c, 0n);
  const disc = toCents(discount);

  if (disc <= 0n || total <= 0n) {
    for (const l of lines) result.set(l.id, new Prisma.Decimal(0));
    return result;
  }
  // The discount can never exceed the subtotal (promo caps it at checkout), but
  // stay defensive so a bad row can never over-credit past the line value.
  const capped = disc > total ? total : disc;

  // Floor each exact share (BigInt division truncates toward zero, and all
  // operands are non-negative, so this is a true floor).
  const floors = cents.map((c) => (capped * c) / total);
  const allocated = floors.reduce((sum, f) => sum + f, 0n);
  const leftover = Number(capped - allocated); // 0 .. lines.length-1 cents

  // Distribute the leftover cents to the largest fractional remainders first;
  // ties break by original index so the result is fully deterministic.
  const order = cents
    .map((c, i) => ({ i, rem: capped * c - floors[i]! * total }))
    .sort((a, b) => (a.rem < b.rem ? 1 : a.rem > b.rem ? -1 : a.i - b.i));

  const alloc = floors.slice();
  for (let k = 0; k < leftover; k += 1) alloc[order[k]!.i]! += 1n;

  lines.forEach((l, i) => result.set(l.id, fromCents(alloc[i]!)));
  return result;
}

/**
 * The amount actually paid for one line = its subtotal minus its share of the
 * order discount. This is the sum a refund credits back (E10) — refunding the
 * gross subtotal on a discounted order would hand back money never collected.
 * Throws if the line is not part of the order (a programming error).
 */
export function refundAmountForLine(
  lines: RefundLine[],
  discount: Prisma.Decimal,
  lineId: string,
): Prisma.Decimal {
  const line = lines.find((l) => l.id === lineId);
  if (!line) {
    throw new Error(`refundAmountForLine: line ${lineId} is not part of the order`);
  }
  const share = allocateDiscount(lines, discount).get(lineId)!;
  return line.subtotal.minus(share);
}
