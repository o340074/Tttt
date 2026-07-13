import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { ApiException } from '../common/api-exception';
import { lineName } from '../cart/cart.service';
import { normalizePromoCode, PromoService } from '../cart/promo.service';
import { SUPPORTED_LOCALES } from '../catalog/locale';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../wallet/idempotency.service';
import { LedgerService } from '../wallet/ledger.service';
import type { Locale, Order, OrderItem, Paginated } from '@advault/types';
import type {
  Order as DbOrder,
  OrderItem as DbOrderItem,
  PromoCode as DbPromoCode,
} from '@prisma/client';
import type { CartItemWithVariant } from '../cart/cart.service';
import type { CheckoutDto } from '../cart/dto/cart.dto';

const CHECKOUT_ENDPOINT = 'POST /orders/checkout';
/** Retries for the rare human-readable order number collision. */
const NUMBER_ATTEMPTS = 3;

type OrderWithItems = DbOrder & { items: DbOrderItem[]; promoCode: DbPromoCode | null };

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
        include: { items: true, promoCode: true },
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
      include: { items: true, promoCode: true },
    });
    if (!row) throw new ApiException('NOT_FOUND', 'Order not found', 404);
    return this.toOrderResponse(row as OrderWithItems, locale);
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

    // The order number is random; on the rare collision the whole transaction
    // rolled back cleanly, so retrying with a fresh number is safe.
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.checkoutTransaction(userId, cart!.id, items, promo, {
          subtotal,
          discount,
          total,
        });
      } catch (error) {
        if (!isUniqueViolation(error, 'number') || attempt >= NUMBER_ATTEMPTS) throw error;
      }
    }
  }

  private checkoutTransaction(
    userId: string,
    cartId: string,
    items: CartItemWithVariant[],
    promo: DbPromoCode | null,
    money: { subtotal: Prisma.Decimal; discount: Prisma.Decimal; total: Prisma.Decimal },
  ): Promise<OrderWithItems> {
    return this.prisma.$transaction(async (tx) => {
      // 1) Availability: atomic check-and-decrement of the stock cache.
      //    The StockItem TTL reserve arrives in E5 (docs/backend/prisma-schema.md).
      for (const item of items) {
        const guarded = await tx.productVariant.updateMany({
          where:
            item.variant.fulfillmentType === 'READY_STOCK'
              ? { id: item.variantId, isActive: true, stockCount: { gte: item.quantity } }
              : { id: item.variantId, isActive: true },
          data:
            item.variant.fulfillmentType === 'READY_STOCK'
              ? { stockCount: { decrement: item.quantity } }
              : { updatedAt: new Date() },
        });
        if (guarded.count === 0) {
          throw new ApiException('OUT_OF_STOCK', 'Not enough items in stock', 409, {
            sku: item.variant.sku,
            available: item.variant.fulfillmentType === 'READY_STOCK' ? undefined : 0,
          });
        }
      }

      // 2) Promo usage under the same guards it was validated with.
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

      // 3) The paid order with purchase-time snapshots.
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

      // 4) Balance debit (double entry; throws INSUFFICIENT_BALANCE on shortfall).
      //    A fully discounted order has nothing to debit.
      if (money.total.gt(0)) {
        await this.ledger.debit(tx, {
          userId,
          amount: money.total,
          refType: 'order',
          refId: order.id,
        });
      }

      // 5) The cart is spent.
      await tx.cartItem.deleteMany({ where: { cartId } });

      return order as OrderWithItems;
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

  private toItemResponse(item: DbOrderItem, locale: Locale): OrderItem {
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
    };
  }
}
