import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception';
import { PromoService } from '../cart/promo.service';
import { IdempotencyService } from '../wallet/idempotency.service';
import { LedgerService } from '../wallet/ledger.service';
import {
  makeCategoryRow,
  makeFakePrismaService,
  makeProductRow,
  makeVariantRow,
} from '../testing/fakes';
import { OrdersService } from './orders.service';
import type { ProductVariant as DbVariant } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { LedgerTx } from '../wallet/ledger.service';

describe('OrdersService.checkout', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let orders: OrdersService;
  let ledger: LedgerService;
  let userId: string;
  let variant: DbVariant;

  /** Seeds a published product with one variant and returns the variant row. */
  const seedVariant = (
    overrides: Partial<Omit<DbVariant, 'price'>> & { sku: string; price: string },
  ): DbVariant => {
    const category = makeCategoryRow({ slug: `cat-${overrides.sku.toLowerCase()}` });
    const product = makeProductRow({
      slug: `product-${overrides.sku.toLowerCase()}`,
      category,
      translations: [],
    });
    product.translations.push(
      {
        id: randomUUID(),
        productId: product.id,
        locale: 'en',
        name: `Product ${overrides.sku}`,
        description: null,
      },
      {
        id: randomUUID(),
        productId: product.id,
        locale: 'ru',
        name: `Товар ${overrides.sku}`,
        description: null,
      },
    );
    const row = makeVariantRow({
      ...overrides,
      productId: product.id,
      attributes: {
        name_en: 'Standard',
        name_ru: 'Стандарт',
        ...((overrides.attributes ?? {}) as Record<string, unknown>),
      },
    });
    product.variants.push(row);
    prisma.product.rows.push(product);
    prisma.productVariant.rows.push(row);
    return row;
  };

  const addToCart = async (variantRow: DbVariant, quantity: number): Promise<void> => {
    let cart = prisma.cart.rows.find((c) => c.userId === userId);
    if (!cart) cart = await prisma.cart.create({ data: { userId } });
    await prisma.cartItem.create({ data: { cartId: cart.id, variantId: variantRow.id, quantity } });
  };

  const creditBalance = async (amount: string): Promise<void> => {
    await ledger.credit(prisma as unknown as LedgerTx, {
      userId,
      amount,
      refType: 'topup',
      refId: randomUUID(),
    });
  };

  const balanceOf = async (): Promise<string> => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user!.balance.toFixed(2);
  };

  beforeEach(async () => {
    prisma = makeFakePrismaService();
    ledger = new LedgerService();
    orders = new OrdersService(
      prisma as unknown as PrismaService,
      ledger,
      new PromoService(prisma as unknown as PrismaService),
      new IdempotencyService(prisma as unknown as PrismaService),
    );
    const user = await prisma.user.create({
      data: { email: 'buyer@advault.dev', passwordHash: 'x' },
    });
    userId = user.id;
    variant = seedVariant({ sku: 'GADS-US-STD', price: '42.00', stockCount: 5 });
    await creditBalance('100.00');
  });

  it('pays the order from the balance: debit + snapshots + stock decrement + cart cleared', async () => {
    await addToCart(variant, 2);
    const order = await orders.checkout(userId, {}, randomUUID(), 'en');

    expect(order.status).toBe('paid');
    expect(order.number).toMatch(/^AV-\d{4}-\d{6}$/);
    expect(order.subtotal).toBe('84.00');
    expect(order.discount).toBe('0.00');
    expect(order.total).toBe('84.00');
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      sku: 'GADS-US-STD',
      name: 'Product GADS-US-STD · Standard',
      quantity: 2,
      unitPrice: '42.00',
      deliveryType: 'auto',
      deliveryStatus: 'pending',
    });

    expect(await balanceOf()).toBe('16.00');
    // Exactly one debit, referencing the order, with the balance snapshot.
    const debits = prisma.ledgerEntry.rows.filter((r) => r.direction === 'debit');
    expect(debits).toHaveLength(1);
    expect(debits[0]).toMatchObject({ refType: 'order', refId: order.id });
    expect(debits[0]!.balanceAfter.toFixed(2)).toBe('16.00');
    // Stock cache decremented and the cart is spent.
    expect(variant.stockCount).toBe(3);
    expect(prisma.cartItem.rows).toHaveLength(0);
  });

  it('applies a percent promo code to the total and counts its use', async () => {
    await prisma.promoCode.create({ data: { code: 'AURORA10', type: 'percent', value: '10.00' } });
    await addToCart(variant, 1);

    const order = await orders.checkout(userId, { promoCode: 'aurora10' }, randomUUID(), 'en');
    expect(order.subtotal).toBe('42.00');
    expect(order.discount).toBe('4.20');
    expect(order.total).toBe('37.80');
    expect(order.promoCode).toBe('AURORA10');
    expect(await balanceOf()).toBe('62.20');
    expect(prisma.promoCode.rows[0]!.usedCount).toBe(1);
  });

  it('caps a fixed promo at the subtotal', async () => {
    await prisma.promoCode.create({ data: { code: 'SAVE100', type: 'fixed', value: '100.00' } });
    const cheap = seedVariant({ sku: 'CHEAP', price: '9.90', stockCount: 1 });
    await addToCart(cheap, 1);

    const order = await orders.checkout(userId, { promoCode: 'SAVE100' }, randomUUID(), 'en');
    expect(order.discount).toBe('9.90');
    expect(order.total).toBe('0.00');
    // Nothing to debit on a fully discounted order.
    expect(prisma.ledgerEntry.rows.filter((r) => r.direction === 'debit')).toHaveLength(0);
    expect(await balanceOf()).toBe('100.00');
  });

  it('rejects an invalid/expired promo code with PROMO_INVALID', async () => {
    await prisma.promoCode.create({
      data: { code: 'EXPIRED10', type: 'percent', value: '10.00', expiresAt: new Date(0) },
    });
    await addToCart(variant, 1);

    await expect(
      orders.checkout(userId, { promoCode: 'EXPIRED10' }, randomUUID(), 'en'),
    ).rejects.toMatchObject({ code: 'PROMO_INVALID' });
    await expect(
      orders.checkout(userId, { promoCode: 'NOPE' }, randomUUID(), 'en'),
    ).rejects.toMatchObject({ code: 'PROMO_INVALID' });
    expect(prisma.order.rows).toHaveLength(0);
  });

  it('throws INSUFFICIENT_BALANCE and leaves balance, stock and cart untouched', async () => {
    const pricey = seedVariant({ sku: 'PRICEY', price: '260.00', stockCount: 2 });
    await addToCart(pricey, 1);

    const error = await orders.checkout(userId, {}, randomUUID(), 'en').then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).code).toBe('INSUFFICIENT_BALANCE');
    expect((error as ApiException).details).toEqual({
      required: '260.00',
      available: '100.00',
    });

    // The transaction rolled back: no order, no debit, stock intact, cart intact.
    expect(prisma.order.rows).toHaveLength(0);
    expect(prisma.ledgerEntry.rows.filter((r) => r.direction === 'debit')).toHaveLength(0);
    expect(await balanceOf()).toBe('100.00');
    expect(pricey.stockCount).toBe(2);
    expect(prisma.cartItem.rows).toHaveLength(1);

    // The key was released — a retry after topping up succeeds.
    await creditBalance('200.00');
    const order = await orders.checkout(userId, {}, randomUUID(), 'en');
    expect(order.total).toBe('260.00');
    expect(await balanceOf()).toBe('40.00');
  });

  it('replays the stored response for the same Idempotency-Key without double charging', async () => {
    await addToCart(variant, 1);
    const key = randomUUID();

    const first = await orders.checkout(userId, {}, key, 'en');
    const replay = await orders.checkout(userId, {}, key, 'en');

    expect(replay.id).toBe(first.id);
    expect(replay.number).toBe(first.number);
    expect(prisma.order.rows).toHaveLength(1);
    expect(prisma.ledgerEntry.rows.filter((r) => r.direction === 'debit')).toHaveLength(1);
    expect(await balanceOf()).toBe('58.00');
  });

  it('rejects the same Idempotency-Key with a different request body', async () => {
    await prisma.promoCode.create({ data: { code: 'AURORA10', type: 'percent', value: '10.00' } });
    await addToCart(variant, 1);
    const key = randomUUID();

    await orders.checkout(userId, {}, key, 'en');
    await expect(
      orders.checkout(userId, { promoCode: 'AURORA10' }, key, 'en'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('throws OUT_OF_STOCK when the quantity exceeds the stock cache', async () => {
    await addToCart(variant, 2);
    variant.stockCount = 1; // someone bought the rest between cart and checkout

    const error = await orders.checkout(userId, {}, randomUUID(), 'en').then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).code).toBe('OUT_OF_STOCK');
    expect(prisma.order.rows).toHaveLength(0);
    expect(await balanceOf()).toBe('100.00');
    expect(variant.stockCount).toBe(1);
  });

  it('throws OUT_OF_STOCK for a deactivated variant', async () => {
    await addToCart(variant, 1);
    variant.isActive = false;

    await expect(orders.checkout(userId, {}, randomUUID(), 'en')).rejects.toMatchObject({
      code: 'OUT_OF_STOCK',
    });
  });

  it('rejects an empty cart with VALIDATION_ERROR', async () => {
    await expect(orders.checkout(userId, {}, randomUUID(), 'en')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('does not decrement the stock cache for MADE_TO_ORDER lines', async () => {
    const warm = seedVariant({
      sku: 'WARM-7D',
      price: '80.00',
      fulfillmentType: 'MADE_TO_ORDER',
      stockCount: 0,
    });
    await addToCart(warm, 1);

    const order = await orders.checkout(userId, {}, randomUUID(), 'en');
    expect(order.items[0]).toMatchObject({ deliveryType: 'manual', deliveryStatus: 'pending' });
    expect(warm.stockCount).toBe(0);
    expect(await balanceOf()).toBe('20.00');
  });

  it('localizes order item names from the purchase-time snapshot', async () => {
    await addToCart(variant, 1);
    const order = await orders.checkout(userId, {}, randomUUID(), 'ru');
    expect(order.items[0]!.name).toBe('Товар GADS-US-STD · Стандарт');

    const reread = await orders.getOrder(userId, order.id, 'en');
    expect(reread.items[0]!.name).toBe('Product GADS-US-STD · Standard');
  });

  it('hides foreign orders (404 for another user)', async () => {
    await addToCart(variant, 1);
    const order = await orders.checkout(userId, {}, randomUUID(), 'en');

    const stranger = await prisma.user.create({
      data: { email: 'stranger@advault.dev', passwordHash: 'x' },
    });
    await expect(orders.getOrder(stranger.id, order.id, 'en')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
