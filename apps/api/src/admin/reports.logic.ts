import { Prisma } from '@prisma/client';
import type { FulfillmentReport, SalesByDimensionRow, SalesReport } from '@advault/types';

const ZERO = new Prisma.Decimal(0);
const MS_PER_MIN = 60_000;

/** A paid order line (price/qty are purchase-time snapshots). */
export interface SoldLine {
  orderId: string;
  variantId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
}

/** Denormalised variant → product/category/goal labels for grouping. */
export interface VariantMeta {
  productId: string;
  productLabel: string;
  categoryId: string;
  categoryLabel: string;
  goal: string | null;
}

interface Bucket {
  label: string;
  revenue: Prisma.Decimal;
  orders: Set<string>;
}

function bump(map: Map<string, Bucket>, key: string, label: string, line: SoldLine): void {
  const bucket = map.get(key) ?? { label, revenue: ZERO, orders: new Set<string>() };
  bucket.revenue = bucket.revenue.plus(line.unitPrice.times(line.quantity));
  bucket.orders.add(line.orderId);
  map.set(key, bucket);
}

function toRows(map: Map<string, Bucket>, limit?: number): SalesByDimensionRow[] {
  const rows = [...map.entries()]
    .map(([key, b]): SalesByDimensionRow => ({
      key,
      label: b.label,
      orders: b.orders.size,
      revenue: b.revenue.toFixed(2),
    }))
    // Highest revenue first; money compared as Decimal, never as float.
    .sort((a, b) => new Prisma.Decimal(b.revenue).comparedTo(new Prisma.Decimal(a.revenue)));
  return limit ? rows.slice(0, limit) : rows;
}

/**
 * Fold paid order lines into sales-by-category, sales-by-goal and top-products
 * rows. Money is summed with Prisma.Decimal (never float) and returned as
 * fixed-2 strings; "orders" is the count of distinct orders per bucket.
 */
export function foldSales(
  lines: SoldLine[],
  meta: Map<string, VariantMeta>,
  opts: { currency: string; topProducts?: number },
): SalesReport {
  const byCategory = new Map<string, Bucket>();
  const byGoal = new Map<string, Bucket>();
  const byProduct = new Map<string, Bucket>();

  for (const line of lines) {
    const m = meta.get(line.variantId);
    if (!m) continue; // variant vanished — skip rather than crash the report
    bump(byCategory, m.categoryId, m.categoryLabel, line);
    bump(byGoal, m.goal ?? 'ready_stock', m.goal ?? 'ready_stock', line);
    bump(byProduct, m.productId, m.productLabel, line);
  }

  return {
    currency: opts.currency,
    byCategory: toRows(byCategory),
    byGoal: toRows(byGoal),
    topProducts: toRows(byProduct, opts.topProducts ?? 10),
  };
}

/** A delivered warming job with its plan target (etaAt) and timestamps. */
export interface DeliveredJob {
  createdAt: Date;
  deliveredAt: Date;
  etaAt: Date | null;
}

function avgMinutes(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10; // one decimal place, 0..100
}

/**
 * Plan-vs-actual delivery time, SLA compliance and refund/replace share
 * (docs/13 §14). Minutes and percentages are ordinary numbers (not money);
 * the "no float" rule applies to money only.
 */
export function computeFulfillment(
  jobs: DeliveredJob[],
  items: { terminal: number; refundedReplaced: number },
): FulfillmentReport {
  const planMinutes: number[] = [];
  const actualMinutes: number[] = [];
  let slaEligible = 0;
  let slaMet = 0;

  for (const job of jobs) {
    actualMinutes.push((job.deliveredAt.getTime() - job.createdAt.getTime()) / MS_PER_MIN);
    if (job.etaAt) {
      planMinutes.push((job.etaAt.getTime() - job.createdAt.getTime()) / MS_PER_MIN);
      slaEligible += 1;
      if (job.deliveredAt.getTime() <= job.etaAt.getTime()) slaMet += 1;
    }
  }

  return {
    deliveredJobs: jobs.length,
    avgPlanMinutes: avgMinutes(planMinutes),
    avgActualMinutes: avgMinutes(actualMinutes),
    slaMetPercent: pct(slaMet, slaEligible),
    refundReplaceRate: pct(items.refundedReplaced, items.terminal),
  };
}
