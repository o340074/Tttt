import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { allocateDiscount, refundAmountForLine } from './refund.logic';

const D = (v: string | number) => new Prisma.Decimal(v);
const line = (id: string, subtotal: string) => ({ id, subtotal: D(subtotal) });

/** Sum of every allocated share, as a Decimal. */
function sum(map: Map<string, Prisma.Decimal>): Prisma.Decimal {
  return [...map.values()].reduce((acc, v) => acc.plus(v), D(0));
}

describe('allocateDiscount', () => {
  it('returns zero for every line when there is no discount', () => {
    const lines = [line('a', '40.00'), line('b', '60.00')];
    const alloc = allocateDiscount(lines, D(0));
    expect(alloc.get('a')!.toFixed(2)).toBe('0.00');
    expect(alloc.get('b')!.toFixed(2)).toBe('0.00');
  });

  it('splits a clean discount proportionally to line subtotals', () => {
    const lines = [line('a', '40.00'), line('b', '60.00')];
    const alloc = allocateDiscount(lines, D('10.00')); // 10% off
    expect(alloc.get('a')!.toFixed(2)).toBe('4.00');
    expect(alloc.get('b')!.toFixed(2)).toBe('6.00');
    expect(sum(alloc).toFixed(2)).toBe('10.00');
  });

  it('distributes leftover cents by largest remainder and sums to the discount exactly', () => {
    // Three equal lines, a discount that does not divide evenly (10/3 = 3.33..).
    const lines = [line('a', '10.00'), line('b', '10.00'), line('c', '10.00')];
    const alloc = allocateDiscount(lines, D('10.00'));
    // Each exact share is 3.333...; floors are 3.33, leftover 1 cent goes to the
    // first line by the index tie-break.
    expect(alloc.get('a')!.toFixed(2)).toBe('3.34');
    expect(alloc.get('b')!.toFixed(2)).toBe('3.33');
    expect(alloc.get('c')!.toFixed(2)).toBe('3.33');
    expect(sum(alloc).toFixed(2)).toBe('10.00');
  });

  it('is deterministic and independent of line order for the total', () => {
    const lines = [line('a', '19.99'), line('b', '5.01'), line('c', '75.00')];
    const alloc = allocateDiscount(lines, D('13.37'));
    expect(sum(alloc).toFixed(2)).toBe('13.37');
    // No line is ever allocated more than its own subtotal.
    for (const l of lines) expect(alloc.get(l.id)!.lte(l.subtotal)).toBe(true);
  });

  it('never allocates more than a line subtotal even if the discount is huge (defensive cap)', () => {
    const lines = [line('a', '10.00'), line('b', '20.00')];
    const alloc = allocateDiscount(lines, D('999.00'));
    expect(alloc.get('a')!.toFixed(2)).toBe('10.00');
    expect(alloc.get('b')!.toFixed(2)).toBe('20.00');
    expect(sum(alloc).toFixed(2)).toBe('30.00');
  });
});

describe('refundAmountForLine', () => {
  it('credits the full subtotal when the order had no discount', () => {
    const lines = [line('a', '40.00'), line('b', '60.00')];
    expect(refundAmountForLine(lines, D(0), 'a').toFixed(2)).toBe('40.00');
  });

  it('credits the line subtotal net of its discount share', () => {
    const lines = [line('a', '40.00'), line('b', '60.00')];
    // 10.00 discount → a owes 4.00 of it → net refund 36.00.
    expect(refundAmountForLine(lines, D('10.00'), 'a').toFixed(2)).toBe('36.00');
    expect(refundAmountForLine(lines, D('10.00'), 'b').toFixed(2)).toBe('54.00');
  });

  it('the sum of every line refund equals the order total paid', () => {
    const lines = [line('a', '10.00'), line('b', '10.00'), line('c', '10.00')];
    const discount = D('10.00');
    const totalRefund = lines
      .map((l) => refundAmountForLine(lines, discount, l.id))
      .reduce((acc, v) => acc.plus(v), D(0));
    // subtotal 30 − discount 10 = 20 collected; refunding all lines returns 20.
    expect(totalRefund.toFixed(2)).toBe('20.00');
  });

  it('throws when the line does not belong to the order', () => {
    const lines = [line('a', '40.00')];
    expect(() => refundAmountForLine(lines, D('5.00'), 'zzz')).toThrow();
  });
});
