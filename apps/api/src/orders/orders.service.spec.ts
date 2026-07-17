import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PromoService } from '../cart/promo.service';
import { PayloadCryptoService } from '../crypto/payload-crypto.service';
import { StockService } from '../stock/stock.service';
import { IdempotencyService } from '../wallet/idempotency.service';
import { LedgerService } from '../wallet/ledger.service';
import { WarmingService } from '../warming/warming.service';
import {
  makeCategoryRow,
  makeFakeConfigService,
  makeFakeNotificationsService,
  makeFakePrismaService,
  makeFakeRedisService,
  makeFakeReferralsService,
  makeProductRow,
  makeVariantRow,
} from '../testing/fakes';
import { OrdersService } from './orders.service';
import type { ProductVariant as DbVariant } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { LedgerTx } from '../wallet/ledger.service';

describe('OrdersService.checkout (E5 stock delivery)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let orders: OrdersService;
  let ledger: LedgerService;
  let stock: StockService;
  let crypto: PayloadCryptoService;
  let userId: string;
  let variant: DbVariant;

  /** Seeds a published product + one variant; for READY_STOCK also seeds its pool. */
  const seedVariant = (
    overrides: Partial<Omit<DbVariant, 'price'>> & { sku: string; price: string },
    stockLines: string[] = [],
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
      stockCount: overrides.fulfillmentType === 'MADE_TO_ORDER' ? 0 : stockLines.length,
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
    for (const line of stockLines) {
      prisma.stockItem.rows.push({
        id: randomUUID(),
        variantId: row.id,
        payload: crypto.encrypt(line),
        payloadHash: crypto.hash(line),
        status: 'available',
        reservedUntil: null,
        orderItemId: null,
        createdAt: new Date(),
      });
    }
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

  const availableCount = (variantId: string): number =>
    prisma.stockItem.rows.filter((r) => r.variantId === variantId && r.status === 'available')
      .length;

  beforeEach(async () => {
    prisma = makeFakePrismaService();
    const config = makeFakeConfigService();
    ledger = new LedgerService();
    crypto = new PayloadCryptoService(config);
    stock = new StockService(
      prisma as unknown as PrismaService,
      makeFakeRedisService() as unknown as RedisService,
      crypto,
      config,
    );
    orders = new OrdersService(
      prisma as unknown as PrismaService,
      ledger,
      new PromoService(prisma as unknown as PrismaService),
      new IdempotencyService(prisma as unknown as PrismaService),
      stock,
      crypto,
      new AuditService(prisma as unknown as PrismaService),
      new WarmingService(
        prisma as unknown as PrismaService,
        crypto,
        new AuditService(prisma as unknown as PrismaService),
        ledger,
        makeFakeNotificationsService(prisma),
        config,
      ),
      makeFakeNotificationsService(prisma),
      makeFakeReferralsService(prisma),
      config,
    );
    const user = await prisma.user.create({
      data: { email: 'buyer@advault.dev', passwordHash: 'x' },
    });
    userId = user.id;
    variant = seedVariant({ sku: 'GADS-US-STD', price: '42.00' }, [
      'ads_us_1@mailbox.io:Pw1',
      'ads_us_2@mailbox.io:Pw2',
      'ads_us_3@mailbox.io:Pw3',
      'ads_us_4@mailbox.io:Pw4',
      'ads_us_5@mailbox.io:Pw5',
    ]);
    await creditBalance('100.00');
  });

  it('auto-delivers ready stock: debit + sold units + Delivery + delivered status', async () => {
    await addToCart(variant, 2);
    const order = await orders.checkout(userId, {}, randomUUID(), 'en');

    expect(order.status).toBe('delivered');
    expect(order.items[0]).toMatchObject({
      sku: 'GADS-US-STD',
      quantity: 2,
      deliveryType: 'auto',
      deliveryStatus: 'delivered',
    });

    expect(await balanceOf()).toBe('16.00');
    // Two units sold to this order item, three left available, cache recomputed.
    const sold = prisma.stockItem.rows.filter((r) => r.status === 'sold');
    expect(sold).toHaveLength(2);
    expect(sold.every((r) => r.orderItemId === order.items[0]!.id)).toBe(true);
    expect(availableCount(variant.id)).toBe(3);
    expect(variant.stockCount).toBe(3);
    // One Delivery per sold unit.
    expect(prisma.delivery.rows).toHaveLength(2);
    expect(prisma.cartItem.rows).toHaveLength(0);
  });

  it('reveals the decrypted delivery only to the owner and writes an audit entry', async () => {
    await addToCart(variant, 1);
    const order = await orders.checkout(userId, {}, randomUUID(), 'en');
    const itemId = order.items[0]!.id;

    const delivery = await orders.getDelivery(userId, order.id, itemId);
    expect(delivery.type).toBe('auto');
    expect(delivery.payload).toBe('ads_us_1@mailbox.io:Pw1'); // decrypted, matches the seeded line
    expect(delivery.deliveredAt).toBeTruthy();

    const audit = prisma.auditLog.rows.filter((r) => r.action === 'delivery.payload_accessed');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: userId, entity: 'OrderItem', entityId: itemId });

    // A stranger cannot see it — 404, and no extra audit entry is written.
    const stranger = await prisma.user.create({
      data: { email: 's@advault.dev', passwordHash: 'x' },
    });
    await expect(orders.getDelivery(stranger.id, order.id, itemId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      prisma.auditLog.rows.filter((r) => r.action === 'delivery.payload_accessed'),
    ).toHaveLength(1);
  });

  it('sells each unit exactly once: a second checkout gets different units, never the same', async () => {
    const buyer2 = await prisma.user.create({
      data: { email: 'b2@advault.dev', passwordHash: 'x' },
    });
    await ledger.credit(prisma as unknown as LedgerTx, {
      userId: buyer2.id,
      amount: '100.00',
      refType: 'topup',
      refId: randomUUID(),
    });

    // Buyer 1 takes 2 of 5; buyer 2 takes 2 — pools must not overlap.
    await addToCart(variant, 2);
    const order1 = await orders.checkout(userId, {}, randomUUID(), 'en');

    const cart2 = await prisma.cart.create({ data: { userId: buyer2.id } });
    await prisma.cartItem.create({
      data: { cartId: cart2.id, variantId: variant.id, quantity: 2 },
    });
    const order2 = await orders.checkout(buyer2.id, {}, randomUUID(), 'en');

    const soldTo1 = prisma.stockItem.rows.filter((r) => r.orderItemId === order1.items[0]!.id);
    const soldTo2 = prisma.stockItem.rows.filter((r) => r.orderItemId === order2.items[0]!.id);
    expect(soldTo1).toHaveLength(2);
    expect(soldTo2).toHaveLength(2);
    // Disjoint units, each sold exactly once.
    const ids1 = new Set(soldTo1.map((r) => r.id));
    expect(soldTo2.some((r) => ids1.has(r.id))).toBe(false);
    expect(prisma.stockItem.rows.filter((r) => r.status === 'sold')).toHaveLength(4);
    expect(availableCount(variant.id)).toBe(1);
  });

  it('rejects checkout with OUT_OF_STOCK when the pool cannot cover the quantity', async () => {
    const scarce = seedVariant({ sku: 'SCARCE', price: '10.00' }, ['only-one']);
    await addToCart(scarce, 2);

    const error = await orders.checkout(userId, {}, randomUUID(), 'en').then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).code).toBe('OUT_OF_STOCK');
    // Nothing sold, the reserve was released, money untouched.
    expect(prisma.order.rows).toHaveLength(0);
    expect(availableCount(scarce.id)).toBe(1);
    expect(scarce.stockCount).toBe(1);
    expect(await balanceOf()).toBe('100.00');
  });

  it('rejects checkout with OUT_OF_STOCK when the pool is empty', async () => {
    const empty = seedVariant({ sku: 'EMPTY', price: '10.00' }, []);
    await addToCart(empty, 1);
    await expect(orders.checkout(userId, {}, randomUUID(), 'en')).rejects.toMatchObject({
      code: 'OUT_OF_STOCK',
    });
    expect(prisma.order.rows).toHaveLength(0);
  });

  it('releases the reserve and leaves the pool intact on INSUFFICIENT_BALANCE', async () => {
    const pricey = seedVariant({ sku: 'PRICEY', price: '260.00' }, ['unit-a', 'unit-b']);
    await addToCart(pricey, 1);

    await expect(orders.checkout(userId, {}, randomUUID(), 'en')).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
    });
    // Reserve released back to available, no unit sold, cache correct.
    expect(availableCount(pricey.id)).toBe(2);
    expect(pricey.stockCount).toBe(2);
    expect(prisma.stockItem.rows.some((r) => r.status !== 'available')).toBe(false);
    expect(prisma.order.rows).toHaveLength(0);
    expect(await balanceOf()).toBe('100.00');

    // After topping up the same checkout succeeds and delivers.
    await creditBalance('200.00');
    const order = await orders.checkout(userId, {}, randomUUID(), 'en');
    expect(order.status).toBe('delivered');
    expect(availableCount(pricey.id)).toBe(1);
  });

  it('marks the order partially_delivered when it mixes ready stock and warm lines', async () => {
    const warm = seedVariant({ sku: 'WARM-7D', price: '20.00', fulfillmentType: 'MADE_TO_ORDER' });
    await addToCart(variant, 1);
    await addToCart(warm, 1);

    const order = await orders.checkout(userId, {}, randomUUID(), 'en');
    expect(order.status).toBe('partially_delivered');
    const ready = order.items.find((i) => i.sku === 'GADS-US-STD')!;
    const made = order.items.find((i) => i.sku === 'WARM-7D')!;
    expect(ready.deliveryStatus).toBe('delivered');
    // E6: the warm line is queued with a warming job + ETA (not delivered yet).
    expect(made.deliveryStatus).toBe('queued');
    expect(made.warming?.status).toBe('queued');
    expect(prisma.warmingJob.rows).toHaveLength(1);
  });

  it('keeps an all-warm order paid with a queued warming job and nothing delivered', async () => {
    const warm = seedVariant({
      sku: 'WARM-ONLY',
      price: '30.00',
      fulfillmentType: 'MADE_TO_ORDER',
    });
    await addToCart(warm, 1);
    const order = await orders.checkout(userId, {}, randomUUID(), 'en');
    expect(order.status).toBe('paid');
    expect(order.items[0]!.deliveryStatus).toBe('queued');
    expect(order.items[0]!.warming?.etaAt).toBeTruthy();
    expect(prisma.delivery.rows).toHaveLength(0);
    expect(prisma.warmingJob.rows).toHaveLength(1);
  });

  it('does not deliver the same unit on a repeated checkout of a fresh cart', async () => {
    await addToCart(variant, 1);
    const order1 = await orders.checkout(userId, {}, randomUUID(), 'en');
    const firstUnit = prisma.stockItem.rows.find((r) => r.orderItemId === order1.items[0]!.id)!;

    await addToCart(variant, 1);
    const order2 = await orders.checkout(userId, {}, randomUUID(), 'en');
    const secondUnit = prisma.stockItem.rows.find((r) => r.orderItemId === order2.items[0]!.id)!;

    expect(secondUnit.id).not.toBe(firstUnit.id);
    expect(availableCount(variant.id)).toBe(3);
  });

  it('applies a percent promo code to the total and counts its use', async () => {
    await prisma.promoCode.create({ data: { code: 'AURORA10', type: 'percent', value: '10.00' } });
    await addToCart(variant, 1);
    const order = await orders.checkout(userId, { promoCode: 'aurora10' }, randomUUID(), 'en');
    expect(order.total).toBe('37.80');
    expect(order.promoCode).toBe('AURORA10');
    expect(await balanceOf()).toBe('62.20');
    expect(prisma.promoCode.rows[0]!.usedCount).toBe(1);
  });

  it('rejects an invalid/expired promo code with PROMO_INVALID and releases the reserve', async () => {
    await prisma.promoCode.create({
      data: { code: 'EXPIRED10', type: 'percent', value: '10.00', expiresAt: new Date(0) },
    });
    await addToCart(variant, 1);
    await expect(
      orders.checkout(userId, { promoCode: 'EXPIRED10' }, randomUUID(), 'en'),
    ).rejects.toMatchObject({ code: 'PROMO_INVALID' });
    expect(prisma.order.rows).toHaveLength(0);
    expect(availableCount(variant.id)).toBe(5); // reserve released
  });

  it('replays the stored response for the same Idempotency-Key without double delivering', async () => {
    await addToCart(variant, 1);
    const key = randomUUID();
    const first = await orders.checkout(userId, {}, key, 'en');
    const replay = await orders.checkout(userId, {}, key, 'en');

    expect(replay.id).toBe(first.id);
    expect(prisma.order.rows).toHaveLength(1);
    expect(prisma.stockItem.rows.filter((r) => r.status === 'sold')).toHaveLength(1);
    expect(await balanceOf()).toBe('58.00');
  });

  it('rejects an empty cart with VALIDATION_ERROR', async () => {
    await expect(orders.checkout(userId, {}, randomUUID(), 'en')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
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
      data: { email: 'x@advault.dev', passwordHash: 'x' },
    });
    await expect(orders.getOrder(stranger.id, order.id, 'en')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
