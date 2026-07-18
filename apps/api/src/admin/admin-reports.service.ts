import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lineName } from '../cart/cart.service';
import { pickTranslation } from '../catalog/locale';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeFulfillment,
  foldSales,
  type DeliveredJob,
  type SoldLine,
  type VariantMeta,
} from './reports.logic';
import type {
  DashboardSummary,
  FulfillmentReport,
  Locale,
  OperatorLoadReport,
  OperatorLoadRow,
  OrderItemDeliveryStatus,
  OrderStatus,
  SalesReport,
  WarmingJobStatus,
} from '@advault/types';

const CURRENCY = 'USD';
/** Order statuses that count as a realised sale (money captured). */
const SOLD_STATUSES: OrderStatus[] = ['paid', 'partially_delivered', 'delivered'];
/** Line statuses that reached a terminal outcome (for refund/replace rate). */
const TERMINAL_ITEM_STATUSES: OrderItemDeliveryStatus[] = ['delivered', 'refunded', 'replaced'];

interface Period {
  from?: Date;
  to?: Date;
}

/**
 * Read-only reporting over orders, warming jobs and the ledger (docs/13 §1/§14).
 * Money is aggregated with Prisma.Decimal / SQL `_sum` (never float); relational
 * groupings (by category/goal) fold SQL-summed lines in memory. Manager+ only.
 */
@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Top-line KPIs (period-bound) plus a live operational snapshot. */
  async dashboard(period: Period): Promise<DashboardSummary> {
    const orderWhere: Prisma.OrderWhereInput = {
      status: { in: SOLD_STATUSES },
      createdAt: this.range(period),
    };

    const [orderAgg, refundAgg, jobGroups, openTickets] = await Promise.all([
      this.prisma.order.aggregate({
        where: orderWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { direction: 'credit', refType: 'refund', createdAt: this.range(period) },
        _sum: { amount: true },
      }),
      this.prisma.warmingJob.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.ticket.count({ where: { status: { in: ['open', 'pending'] } } }),
    ]);

    const zero = new Prisma.Decimal(0);
    const revenue = orderAgg._sum.total ?? zero;
    const orders = orderAgg._count._all;
    const avgOrder = orders > 0 ? revenue.dividedBy(orders) : zero;

    const jobCount = (status: WarmingJobStatus): number =>
      jobGroups.find((g) => g.status === status)?._count._all ?? 0;

    // Overdue: jobs still in flight past their SLA/ETA (separate cheap count).
    const warmingOverdue = await this.prisma.warmingJob.count({
      where: {
        status: { in: ['queued', 'assigned', 'in_progress', 'qc'] },
        etaAt: { lt: new Date() },
      },
    });

    return {
      currency: CURRENCY,
      revenue: revenue.toFixed(2),
      orders,
      avgOrder: avgOrder.toFixed(2),
      refunds: (refundAgg._sum.amount ?? zero).toFixed(2),
      ops: {
        warmingQueued: jobCount('queued'),
        warmingInProgress: jobCount('in_progress') + jobCount('assigned'),
        warmingQc: jobCount('qc'),
        warmingReady: jobCount('ready'),
        warmingOverdue,
        openTickets,
      },
    };
  }

  /** Sales split by category, by goal and top products (revenue desc). */
  async sales(period: Period, locale: Locale): Promise<SalesReport> {
    const lines = await this.prisma.orderItem.findMany({
      where: { order: { status: { in: SOLD_STATUSES }, createdAt: this.range(period) } },
      select: {
        orderId: true,
        variantId: true,
        quantity: true,
        unitPrice: true,
        variant: {
          include: {
            product: {
              include: {
                translations: true,
                category: { include: { translations: true } },
              },
            },
          },
        },
      },
    });

    const meta = new Map<string, VariantMeta>();
    const sold: SoldLine[] = [];
    for (const line of lines) {
      const variant = line.variant;
      if (!meta.has(line.variantId)) {
        const categoryName =
          pickTranslation(variant.product.category.translations, locale)?.name ??
          variant.product.category.slug;
        meta.set(line.variantId, {
          productId: variant.productId,
          productLabel: lineName(variant, locale),
          categoryId: variant.product.categoryId,
          categoryLabel: categoryName,
          goal: variant.goal,
        });
      }
      sold.push({
        orderId: line.orderId,
        variantId: line.variantId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      });
    }

    return foldSales(sold, meta, { currency: CURRENCY });
  }

  /** Plan-vs-actual delivery time, SLA compliance and refund/replace share. */
  async fulfillment(period: Period): Promise<FulfillmentReport> {
    const [jobs, terminal, refundedReplaced] = await Promise.all([
      this.prisma.warmingJob.findMany({
        where: { status: 'delivered', deliveredAt: this.range(period) },
        select: { createdAt: true, deliveredAt: true, etaAt: true },
      }),
      this.prisma.orderItem.count({
        where: {
          deliveryStatus: { in: TERMINAL_ITEM_STATUSES },
          order: { createdAt: this.range(period) },
        },
      }),
      this.prisma.orderItem.count({
        where: {
          deliveryStatus: { in: ['refunded', 'replaced'] },
          order: { createdAt: this.range(period) },
        },
      }),
    ]);

    const delivered: DeliveredJob[] = jobs
      .filter((j): j is typeof j & { deliveredAt: Date } => j.deliveredAt !== null)
      .map((j) => ({ createdAt: j.createdAt, deliveredAt: j.deliveredAt, etaAt: j.etaAt }));

    return computeFulfillment(delivered, { terminal, refundedReplaced });
  }

  /** Per-operator warming load: active vs delivered jobs. */
  async operators(period: Period): Promise<OperatorLoadReport> {
    const [active, delivered, staff] = await Promise.all([
      this.prisma.warmingJob.groupBy({
        by: ['assignedTo'],
        where: {
          assignedTo: { not: null },
          status: { in: ['assigned', 'in_progress', 'qc', 'ready', 'on_hold'] },
        },
        _count: { _all: true },
      }),
      this.prisma.warmingJob.groupBy({
        by: ['assignedTo'],
        where: {
          assignedTo: { not: null },
          status: 'delivered',
          deliveredAt: this.range(period),
        },
        _count: { _all: true },
      }),
      this.prisma.user.findMany({
        where: { role: { in: ['operator', 'manager', 'admin'] } },
        select: { id: true, email: true },
      }),
    ]);

    const activeBy = new Map(active.map((g) => [g.assignedTo, g._count._all]));
    const deliveredBy = new Map(delivered.map((g) => [g.assignedTo, g._count._all]));

    const operators: OperatorLoadRow[] = staff
      .map((u) => ({
        operatorId: u.id,
        email: u.email,
        active: activeBy.get(u.id) ?? 0,
        delivered: deliveredBy.get(u.id) ?? 0,
      }))
      .filter((row) => row.active > 0 || row.delivered > 0)
      .sort((a, b) => b.active - a.active || b.delivered - a.delivered);

    return { operators };
  }

  // ---------- Internals ----------

  private range(period: Period): Prisma.DateTimeFilter | undefined {
    if (!period.from && !period.to) return undefined;
    const filter: Prisma.DateTimeFilter = {};
    if (period.from) filter.gte = period.from;
    if (period.to) filter.lt = period.to;
    return filter;
  }
}
