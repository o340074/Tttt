import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  computeFulfillment,
  foldSales,
  type DeliveredJob,
  type SoldLine,
  type VariantMeta,
} from './reports.logic';

const meta = new Map<string, VariantMeta>([
  [
    'v1',
    {
      productId: 'p1',
      productLabel: 'Ads · Std',
      categoryId: 'c1',
      categoryLabel: 'Google Ads',
      goal: 'google_ads',
    },
  ],
  [
    'v2',
    {
      productId: 'p2',
      productLabel: 'Ext · Dev',
      categoryId: 'c2',
      categoryLabel: 'Chrome',
      goal: 'chrome_extension_dev',
    },
  ],
  [
    'v3',
    {
      productId: 'p3',
      productLabel: 'Stock acc',
      categoryId: 'c1',
      categoryLabel: 'Google Ads',
      goal: null,
    },
  ],
]);

const line = (orderId: string, variantId: string, price: string, qty = 1): SoldLine => ({
  orderId,
  variantId,
  quantity: qty,
  unitPrice: new Prisma.Decimal(price),
});

describe('reports.logic — foldSales', () => {
  it('sums revenue per category/goal/product with Decimal precision', () => {
    const report = foldSales(
      [
        line('o1', 'v1', '10.10'),
        line('o2', 'v1', '10.20'),
        line('o3', 'v2', '5.00', 2),
        line('o4', 'v3', '3.33'),
      ],
      meta,
      { currency: 'USD' },
    );

    // Category c1 = v1 (10.10+10.20) + v3 (3.33) = 23.63
    const c1 = report.byCategory.find((r) => r.key === 'c1')!;
    expect(c1.revenue).toBe('23.63');
    expect(c1.orders).toBe(3);

    // Goal ready_stock bucket for the null-goal variant.
    expect(report.byGoal.some((r) => r.key === 'ready_stock')).toBe(true);

    // Top products sorted by revenue desc: v1 product (20.30) first.
    expect(report.topProducts[0]!.key).toBe('p1');
    expect(report.topProducts[0]!.revenue).toBe('20.30');
  });

  it('counts distinct orders, not lines', () => {
    const report = foldSales([line('o1', 'v1', '5'), line('o1', 'v1', '5')], meta, {
      currency: 'USD',
    });
    expect(report.byCategory[0]!.orders).toBe(1);
    expect(report.byCategory[0]!.revenue).toBe('10.00');
  });

  it('skips lines whose variant metadata is missing', () => {
    const report = foldSales([line('o1', 'gone', '9')], meta, { currency: 'USD' });
    expect(report.byCategory).toHaveLength(0);
  });
});

describe('reports.logic — computeFulfillment', () => {
  const base = new Date('2026-07-01T00:00:00Z');
  const at = (min: number): Date => new Date(base.getTime() + min * 60_000);

  it('computes plan/actual averages and SLA compliance', () => {
    const jobs: DeliveredJob[] = [
      // planned 120m, delivered in 100m → within SLA
      { createdAt: base, etaAt: at(120), deliveredAt: at(100) },
      // planned 120m, delivered in 180m → SLA miss
      { createdAt: base, etaAt: at(120), deliveredAt: at(180) },
    ];
    const r = computeFulfillment(jobs, { terminal: 10, refundedReplaced: 2 });
    expect(r.deliveredJobs).toBe(2);
    expect(r.avgPlanMinutes).toBe(120);
    expect(r.avgActualMinutes).toBe(140);
    expect(r.slaMetPercent).toBe(50);
    expect(r.refundReplaceRate).toBe(20);
  });

  it('is safe with no jobs and no terminal items', () => {
    const r = computeFulfillment([], { terminal: 0, refundedReplaced: 0 });
    expect(r).toMatchObject({
      deliveredJobs: 0,
      avgPlanMinutes: 0,
      avgActualMinutes: 0,
      slaMetPercent: 0,
      refundReplaceRate: 0,
    });
  });
});
