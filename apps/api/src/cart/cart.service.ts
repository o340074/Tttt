import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { pickTranslation } from '../catalog/locale';
import { variantName } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_QUANTITY } from './dto/cart.dto';
import type { Cart, CartItem, Locale } from '@advault/types';
import type {
  CartItem as DbCartItem,
  Product as DbProduct,
  ProductTranslation,
  ProductVariant as DbVariant,
} from '@prisma/client';

export type CartItemWithVariant = DbCartItem & {
  variant: DbVariant & { product: DbProduct & { translations: ProductTranslation[] } };
};

const ITEM_INCLUDE = {
  variant: { include: { product: { include: { translations: true } } } },
} as const;

/** Localized "product · variant" display name for cart/order lines. */
export function lineName(item: CartItemWithVariant['variant'], locale: Locale): string {
  const product = pickTranslation(item.product.translations, locale)?.name ?? item.product.slug;
  return `${product} · ${variantName(item, locale)}`;
}

/**
 * Server-side cart, 1:1 with the user (docs/backend/prisma-schema.md).
 * Lines hold live variant data — prices and names are NOT snapshots;
 * snapshots are taken at checkout when the order is created.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId: string, locale: Locale): Promise<Cart> {
    const cart = await this.loadCart(userId);
    return this.toCartResponse(cart.id, cart.items, locale);
  }

  async addItem(
    userId: string,
    variantId: string,
    quantity: number,
    locale: Locale,
  ): Promise<Cart> {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant || !variant.isActive) {
      throw new ApiException('NOT_FOUND', 'Product variant is not available', 404);
    }

    const cart = await this.loadCart(userId);
    const existing = cart.items.find((item) => item.variantId === variantId);
    const nextQuantity = Math.min((existing?.quantity ?? 0) + quantity, MAX_QUANTITY);
    this.assertStock(variant, nextQuantity);

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: nextQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, variantId, quantity: nextQuantity },
      });
    }
    return this.getCart(userId, locale);
  }

  async updateItem(
    userId: string,
    itemId: string,
    quantity: number,
    locale: Locale,
  ): Promise<Cart> {
    const item = await this.requireItem(userId, itemId);
    this.assertStock(item.variant, quantity);
    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    return this.getCart(userId, locale);
  }

  async removeItem(userId: string, itemId: string, locale: Locale): Promise<Cart> {
    const item = await this.requireItem(userId, itemId);
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.getCart(userId, locale);
  }

  // ---------- Internals ----------

  /** The user's cart with items, created lazily on first access. */
  private async loadCart(userId: string): Promise<{ id: string; items: CartItemWithVariant[] }> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: ITEM_INCLUDE, orderBy: { createdAt: 'asc' } } },
    });
    if (cart) return cart as { id: string; items: CartItemWithVariant[] };
    const created = await this.prisma.cart.create({ data: { userId } });
    return { id: created.id, items: [] };
  }

  private async requireItem(userId: string, itemId: string): Promise<CartItemWithVariant> {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
      include: ITEM_INCLUDE,
    });
    if (!item) throw new ApiException('NOT_FOUND', 'Cart item not found', 404);
    return item as CartItemWithVariant;
  }

  /** READY_STOCK lines cannot exceed the cached stock; MADE_TO_ORDER has no cap. */
  private assertStock(variant: DbVariant, quantity: number): void {
    if (variant.fulfillmentType === 'READY_STOCK' && quantity > variant.stockCount) {
      throw new ApiException('OUT_OF_STOCK', 'Not enough items in stock', 409, {
        sku: variant.sku,
        available: variant.stockCount,
      });
    }
  }

  private toCartResponse(cartId: string, items: CartItemWithVariant[], locale: Locale): Cart {
    const lines = items.map((item) => this.toItemResponse(item, locale));
    // Inactive lines stay visible (the UI asks to remove them) but do not count.
    const subtotal = items
      .filter((item) => item.variant.isActive)
      .reduce(
        (sum, item) => sum.plus(item.variant.price.times(item.quantity)),
        new Prisma.Decimal(0),
      );
    return { id: cartId, items: lines, subtotal: subtotal.toFixed(2), currency: 'USD' };
  }

  private toItemResponse(item: CartItemWithVariant, locale: Locale): CartItem {
    const { variant } = item;
    return {
      id: item.id,
      variantId: item.variantId,
      sku: variant.sku,
      name: lineName(variant, locale),
      productSlug: variant.product.slug,
      quantity: item.quantity,
      unitPrice: variant.price.toFixed(2),
      lineTotal: variant.price.times(item.quantity).toFixed(2),
      fulfillmentType: variant.fulfillmentType,
      stockCount: variant.stockCount,
      etaMinutes: variant.etaMinutes,
      isActive: variant.isActive,
      attributes: (variant.product.attributes ?? {}) as Record<string, unknown>,
    };
  }
}
