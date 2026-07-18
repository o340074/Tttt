import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import { WarmingService } from '../warming/warming.service';
import type {
  AdminOrderDetail,
  AdminOrderListItem,
  Locale,
  OrderItem,
  OrderStatus,
  Paginated,
} from '@advault/types';
import type {
  Order as DbOrder,
  OrderItem as DbOrderItem,
  PromoCode as DbPromoCode,
  User as DbUser,
  WarmingJob as DbWarmingJob,
  WarmingTask as DbWarmingTask,
} from '@prisma/client';

type DbOrderItemWithWarming = DbOrderItem & {
  warmingJob: (DbWarmingJob & { tasks: DbWarmingTask[] }) | null;
};
type OrderWithRelations = DbOrder & {
  user: Pick<DbUser, 'id' | 'email'>;
  items: DbOrderItemWithWarming[];
  promoCode: DbPromoCode | null;
};

/** Buyer, lines (with warming) and promo — everything the admin views need. */
const ADMIN_ORDER_INCLUDE = {
  user: { select: { id: true, email: true } },
  items: { include: { warmingJob: { include: { tasks: { orderBy: { order: 'asc' } } } } } },
  promoCode: true,
} satisfies Prisma.OrderInclude;

/**
 * Admin/operator read surface over every buyer's orders (docs/13, docs/14).
 * Read-only here: fulfilment moves through the warming/inventory endpoints.
 * Delivery payloads stay owner-only (E5) and are never exposed on this surface.
 */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warming: WarmingService,
  ) {}

  async list(
    filters: { status?: OrderStatus; q?: string },
    page: number,
    limit: number,
  ): Promise<Paginated<AdminOrderListItem>> {
    const where: Prisma.OrderWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { number: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ADMIN_ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: (rows as OrderWithRelations[]).map((row) => this.toListItem(row)),
      meta: { total, page, limit },
    };
  }

  async get(id: string, locale: Locale): Promise<AdminOrderDetail> {
    const row = await this.prisma.order.findUnique({ where: { id }, include: ADMIN_ORDER_INCLUDE });
    if (!row) throw new ApiException('NOT_FOUND', 'Order not found', 404);
    return this.toDetail(row as OrderWithRelations, locale);
  }

  // ---------- Mapping ----------

  private toListItem(row: OrderWithRelations): AdminOrderListItem {
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      buyer: { id: row.user.id, email: row.user.email },
      itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
      total: row.total.toFixed(2),
      currency: row.currency,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDetail(row: OrderWithRelations, locale: Locale): AdminOrderDetail {
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      buyer: { id: row.user.id, email: row.user.email },
      subtotal: row.subtotal.toFixed(2),
      discount: row.discount.toFixed(2),
      total: row.total.toFixed(2),
      currency: row.currency,
      promoCode: row.promoCode?.code ?? null,
      items: row.items.map((item) => this.toItem(item, locale)),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toItem(item: DbOrderItemWithWarming, locale: Locale): OrderItem {
    const names = (item.nameSnapshot ?? {}) as Partial<Record<Locale, string>>;
    return {
      id: item.id,
      variantId: item.variantId,
      sku: item.sku,
      name: names[locale] ?? names.en ?? item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      deliveryType: item.deliveryType,
      deliveryStatus: item.deliveryStatus,
      warming: this.warming.buildProgress(item.warmingJob),
    };
  }
}
