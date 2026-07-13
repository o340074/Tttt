import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { lineName } from '../cart/cart.service';
import { normalizePromoCode, PromoService } from '../cart/promo.service';
import { SUPPORTED_LOCALES } from '../catalog/locale';
import { PayloadCryptoService } from '../crypto/payload-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { IdempotencyService } from '../wallet/idempotency.service';
import { LedgerService } from '../wallet/ledger.service';
import { WarmingService } from '../warming/warming.service';
import type {
  DeliveryPayload,
  Locale,
  Order,
  OrderItem,
  OrderStatus,
  Paginated,
} from '@advault/types';
import type {
  Order as DbOrder,
  OrderItem as DbOrderItem,
  PromoCode as DbPromoCode,
  WarmingJob as DbWarmingJob,
  WarmingTask as DbWarmingTask,
} from '@prisma/client';
import type { CartItemWithVariant } from '../cart/cart.service';
import type { CheckoutDto } from '../cart/dto/cart.dto';

const CHECKOUT_ENDPOINT = 'POST /orders/checkout';
/** Retries for the rare human-readable order number collision. */
const NUMBER_ATTEMPTS = 3;

type DbOrderItemWithWarming = DbOrderItem & {
  warmingJob: (DbWarmingJob & { tasks: DbWarmingTask[] }) | null;
};
type OrderWithItems = DbOrder & {
  items: DbOrderItemWithWarming[];
  promoCode: DbPromoCode | null;
};

/** Load the warming job + its tasks alongside each item, for buyer progress. */
const ORDER_INCLUDE = {
  items: { include: { warmingJob: { include: { tasks: { orderBy: { order: 'asc' } } } } } },
  promoCode: true,
} satisfies Prisma.OrderInclude;

/** Reserved stock ids per cart line, keyed by variantId (unique within a cart). */
type Reservations = Map<string, string[]>;

/** e.g. AV-2026-482913 (docs/backend/prisma-schema.md). */
function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  return `AV-${year}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}

function isUniqueViolation(error: unknown, field: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta?.target ?? '').includes(field)
  );
}

/**
 * Order status as an aggregate of its lines (docs/14): everything delivered →
 * delivered; a mix of delivered and still-pending (warm) lines →
 * partially_delivered; nothing delivered yet (all made-to-order) → paid.
 */
function aggregateOrderStatus(totalLines: number, deliveredLines: number): OrderStatus {
  if (deliveredLines === 0) return 'paid';
  if (deliveredLines === totalLines) return 'delivered';
  return 'partially_delivered';
}

/**
 * Checkout & order history (docs/08, docs/14). Payment is a balance debit:
 * one DB transaction covers the stock decrement, promo usage, ledger debit
 * and the paid order with price/name snapshots, so money and goods move
 * together or not at all.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly promo: PromoService,
    private readonly idempotency: IdempotencyService,
    private readonly stock: StockService,
    private readonly crypto: PayloadCryptoService,
    private readonly audit: AuditService,
    private readonly warming: WarmingService,
  ) {}

  async checkout(
    userId: string,
    dto: CheckoutDto,
    idempotencyKey: string,
    locale: Locale,
  ): Promise<Order> {
    const replay = await this.idempotency.claim(idempotencyKey, CHECKOUT_ENDPOINT, userId, dto);
    // A replay returns the stored body as-is (its names keep the original locale).
    if (replay) return replay.body as Order;

    try {
      const order = await this.performCheckout(userId, dto);
      const response = this.toOrderResponse(order, locale);
      await this.idempotency.saveResponse(idempotencyKey, CHECKOUT_ENDPOINT, 201, response);
      return response;
    } catch (error) {
      // Free the key so the client may retry after fixing the cause
      // (top up the balance, drop an out-of-stock line, …).
      await this.idempotency.release(idempotencyKey, CHECKOUT_ENDPOINT);
      throw error;
    }
  }

  async listOrders(
    userId: string,
    page: number,
    limit: number,
    locale: Locale,
  ): Promise<Paginated<Order>> {
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);
    return {
      data: (rows as OrderWithItems[]).map((row) => this.toOrderResponse(row, locale)),
      meta: { total, page, limit },
    };
  }

  async getOrder(userId: string, id: string, locale: Locale): Promise<Order> {
    const row = await this.prisma.order.findFirst({
      where: { id, userId },
      include: ORDER_INCLUDE,
    });
    if (!row) throw new ApiException('NOT_FOUND', 'Order not found', 404);
    return this.toOrderResponse(row as OrderWithItems, locale);
  }

  /**
   * Decrypted delivery for one order item — owner-only (docs/09). A foreign or
   * unknown order is 404 (existence is not disclosed); an item that has no
   * delivery yet is 404. Every successful read is written to the audit log.
   */
  async getDelivery(userId: string, orderId: string, itemId: string): Promise<DeliveryPayload> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId, order: { userId } },
      include: { deliveries: { orderBy: { createdAt: 'asc' } } },
    });
    if (!item || item.deliveries.length === 0) {
      throw new ApiException('NOT_FOUND', 'Delivery not found', 404);
    }

    // One Delivery per sold unit; join their decrypted payloads, one per line.
    const payload = item.deliveries.map((d) => this.crypto.decrypt(d.payload)).join('\n');
    const latest = item.deliveries[item.deliveries.length - 1]!;

    await this.audit.record({
      actorId: userId,
      action: 'delivery.payload_accessed',
      entity: 'OrderItem',
      entityId: itemId,
      diff: { orderId, units: item.deliveries.length },
    });

    return {
      orderItemId: itemId,
      type: latest.type,
      payload,
      deliveredAt: (latest.deliveredAt ?? latest.createdAt).toISOString(),
    };
  }

  // ---------- Checkout internals ----------

  private async performCheckout(userId: string, dto: CheckoutDto): Promise<OrderWithItems> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { variant: { include: { product: { include: { translations: true } } } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const items = (cart?.items ?? []) as CartItemWithVariant[];
    if (items.length === 0) {
      throw new ApiException('VALIDATION_ERROR', 'Cart is empty', 400);
    }
    for (const item of items) {
      if (!item.variant.isActive) {
        throw new ApiException('OUT_OF_STOCK', 'A cart item is no longer available', 409, {
          sku: item.variant.sku,
          available: 0,
        });
      }
    }

    const subtotal = items.reduce(
      (sum, item) => sum.plus(item.variant.price.times(item.quantity)),
      new Prisma.Decimal(0),
    );
    let promo: DbPromoCode | null = null;
    if (dto.promoCode) {
      promo = await this.promo.findValid(dto.promoCode);
      if (!promo) {
        throw new ApiException('PROMO_INVALID', 'Promo code is invalid or expired', 409, {
          code: normalizePromoCode(dto.promoCode),
        });
      }
    }
    const discount = promo ? this.promo.discountFor(promo, subtotal) : new Prisma.Decimal(0);
    const total = subtotal.minus(discount);

    // Phase 1 (before the money transaction): reserve concrete StockItems for
    // every READY_STOCK line. A reservation is a committed available→reserved
    // flip with a TTL, so if the money transaction fails we must release it.
    const reservations = await this.reserveStock(items);

    try {
      // The order number is random; on the rare collision the whole transaction
      // rolled back cleanly, so retrying with a fresh number is safe.
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await this.checkoutTransaction(userId, cart!.id, items, promo, reservations, {
            subtotal,
            discount,
            total,
          });
        } catch (error) {
          if (!isUniqueViolation(error, 'number') || attempt >= NUMBER_ATTEMPTS) throw error;
        }
      }
    } catch (error) {
      // Money transaction failed for good — hand the reserved units back.
      await this.stock.release([...reservations.values()].flat());
      throw error;
    }
  }

  /** Reserve stock for READY_STOCK lines; release any partial claim on failure. */
  private async reserveStock(items: CartItemWithVariant[]): Promise<Reservations> {
    const reservations: Reservations = new Map();
    try {
      for (const item of items) {
        if (item.variant.fulfillmentType !== 'READY_STOCK') continue;
        const ids = await this.stock.reserve(item.variantId, item.quantity, item.variant.sku);
        reservations.set(item.variantId, ids);
      }
    } catch (error) {
      await this.stock.release([...reservations.values()].flat());
      throw error;
    }
    return reservations;
  }

  private checkoutTransaction(
    userId: string,
    cartId: string,
    items: CartItemWithVariant[],
    promo: DbPromoCode | null,
    reservations: Reservations,
    money: { subtotal: Prisma.Decimal; discount: Prisma.Decimal; total: Prisma.Decimal },
  ): Promise<OrderWithItems> {
    return this.prisma.$transaction(async (tx) => {
      // 1) Promo usage under the same guards it was validated with.
      if (promo) {
        const claimed = await tx.promoCode.updateMany({
          where: {
            id: promo.id,
            OR: [{ maxUses: null }, { usedCount: { lt: promo.maxUses ?? 0 } }],
            AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
          },
          data: { usedCount: { increment: 1 } },
        });
        if (claimed.count === 0) {
          throw new ApiException('PROMO_INVALID', 'Promo code is invalid or expired', 409, {
            code: promo.code,
          });
        }
      }

      // 2) The order with purchase-time snapshots (items start pending).
      const order = await tx.order.create({
        data: {
          userId,
          number: generateOrderNumber(),
          status: 'paid',
          subtotal: money.subtotal,
          discount: money.discount,
          total: money.total,
          currency: 'USD',
          promoCodeId: promo?.id ?? null,
          items: {
            create: items.map((item) => ({
              variantId: item.variantId,
              sku: item.variant.sku,
              nameSnapshot: Object.fromEntries(
                SUPPORTED_LOCALES.map((locale) => [locale, lineName(item.variant, locale)]),
              ),
              quantity: item.quantity,
              unitPrice: item.variant.price,
              deliveryType: item.variant.deliveryType,
              deliveryStatus: 'pending' as const,
            })),
          },
        },
        include: { items: true, promoCode: true },
      });

      // 3) Fulfil each line. READY_STOCK: reserved → sold + Delivery → delivered.
      //    MADE_TO_ORDER: create a queued WarmingJob (+stages, ETA) → queued.
      const itemByVariant = new Map(items.map((item) => [item.variantId, item]));
      let deliveredLines = 0;
      for (const orderItem of order.items) {
        const reserved = reservations.get(orderItem.variantId);
        if (reserved) {
          await this.stock.sellReserved(tx, reserved, orderItem.id);
          orderItem.deliveryStatus = 'delivered';
          deliveredLines += 1;
          continue;
        }
        const cartItem = itemByVariant.get(orderItem.variantId);
        if (cartItem?.variant.fulfillmentType === 'MADE_TO_ORDER') {
          const status = await this.warming.createJobForItem(tx, orderItem.id, cartItem.variant);
          await tx.orderItem.update({
            where: { id: orderItem.id },
            data: { deliveryStatus: status },
          });
          orderItem.deliveryStatus = status;
        }
      }

      // 4) Order status is the aggregate of its line delivery states (docs/14).
      const status = aggregateOrderStatus(order.items.length, deliveredLines);
      if (status !== 'paid') {
        await tx.order.update({ where: { id: order.id }, data: { status } });
        order.status = status;
      }

      // 5) Balance debit (double entry; throws INSUFFICIENT_BALANCE on shortfall).
      //    A fully discounted order has nothing to debit.
      if (money.total.gt(0)) {
        await this.ledger.debit(tx, {
          userId,
          amount: money.total,
          refType: 'order',
          refId: order.id,
        });
      }

      // 6) The cart is spent.
      await tx.cartItem.deleteMany({ where: { cartId } });

      // Re-read with warming jobs/tasks so the response carries buyer progress.
      const full = await tx.order.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE });
      return full as OrderWithItems;
    });
  }

  // ---------- Mapping ----------

  private toOrderResponse(row: OrderWithItems, locale: Locale): Order {
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      subtotal: row.subtotal.toFixed(2),
      discount: row.discount.toFixed(2),
      total: row.total.toFixed(2),
      currency: row.currency,
      promoCode: row.promoCode?.code ?? null,
      items: row.items.map((item) => this.toItemResponse(item, locale)),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toItemResponse(item: DbOrderItemWithWarming, locale: Locale): OrderItem {
    // The snapshot carries every locale taken at purchase time.
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
