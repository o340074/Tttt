import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
  AccountAsset as DbAccountAsset,
  AuditLog as DbAuditLog,
  Bundle as DbBundle,
  BundleComponent as DbBundleComponent,
  Cart as DbCart,
  CartItem as DbCartItem,
  Category as DbCategory,
  CategoryTranslation,
  Delivery as DbDelivery,
  IdempotencyKey as DbIdempotencyKey,
  LedgerEntry as DbLedgerEntry,
  OctoProfile as DbOctoProfile,
  Order as DbOrder,
  OrderItem as DbOrderItem,
  Product as DbProduct,
  ProxyItem as DbProxyItem,
  ProductTranslation,
  ProductVariant as DbVariant,
  PromoCode as DbPromoCode,
  StockItem as DbStockItem,
  TopUp as DbTopUp,
  User as DbUser,
  WarmingJob as DbWarmingJob,
  WarmingPlan as DbWarmingPlan,
  WarmingStageTemplate as DbWarmingStageTemplate,
  WarmingTask as DbWarmingTask,
} from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { Env } from '../config/env';
import type { ConfigService } from '@nestjs/config';

/**
 * In-memory stand-ins for Redis and Prisma — enough surface for the auth
 * flows, so unit and smoke tests run without live services (and in CI).
 */

type MultiOp = () => Promise<unknown>;

export class FakeRedisClient {
  readonly store = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();

  async set(key: string, value: string | number, ..._opts: unknown[]): Promise<'OK'> {
    this.store.set(key, String(value));
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted += 1;
      if (this.sets.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async sadd(key: string, member: string): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    this.sets.set(key, set);
    const added = set.has(member) ? 0 : 1;
    set.add(member);
    return added;
  }

  async srem(key: string, member: string): Promise<number> {
    return this.sets.get(key)?.delete(member) ? 1 : 0;
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }

  async expire(_key: string, _ttl: number): Promise<number> {
    return 1; // TTL expiry is not simulated
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  multi(): {
    set: (...args: Parameters<FakeRedisClient['set']>) => unknown;
    sadd: (key: string, member: string) => unknown;
    expire: (key: string, ttl: number) => unknown;
    exec: () => Promise<unknown[]>;
  } {
    const ops: MultiOp[] = [];
    const chain = {
      set: (...args: Parameters<FakeRedisClient['set']>) => {
        ops.push(() => this.set(...args));
        return chain;
      },
      sadd: (key: string, member: string) => {
        ops.push(() => this.sadd(key, member));
        return chain;
      },
      expire: (key: string, ttl: number) => {
        ops.push(() => this.expire(key, ttl));
        return chain;
      },
      exec: async () => {
        const results: unknown[] = [];
        for (const op of ops) results.push(await op());
        return results;
      },
    };
    return chain;
  }
}

export function makeFakeRedisService(): RedisService & { client: FakeRedisClient } {
  const client = new FakeRedisClient();
  return {
    client,
    isHealthy: async () => true,
    onModuleDestroy: async () => undefined,
  } as unknown as RedisService & { client: FakeRedisClient };
}

export class FakeUserStore {
  readonly rows: DbUser[] = [];

  /** Orders getter (optional): powers admin _count.orders and recent orders. */
  constructor(private readonly orders: () => FakeOrderStore | undefined = () => undefined) {}

  private ordersOf(userId: string): DbOrder[] {
    return (this.orders()?.rows ?? []).filter((o) => o.userId === userId);
  }

  private decorate(
    row: DbUser,
    include?: { _count?: unknown; orders?: { take?: number; orderBy?: unknown } },
  ): DbUser & { _count?: { orders: number }; orders?: DbOrder[] } {
    if (!include) return row;
    const decorated: DbUser & { _count?: { orders: number }; orders?: DbOrder[] } = { ...row };
    const mine = this.ordersOf(row.id);
    if (include._count) decorated._count = { orders: mine.length };
    if (include.orders) {
      const sorted = [...mine].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      decorated.orders = include.orders.take ? sorted.slice(0, include.orders.take) : sorted;
    }
    return decorated;
  }

  findUnique({
    where,
    include,
  }: {
    where: { id?: string; email?: string };
    include?: { _count?: unknown; orders?: { take?: number; orderBy?: unknown } };
  }): Promise<(DbUser & { _count?: { orders: number }; orders?: DbOrder[] }) | null> {
    const row =
      this.rows.find((r) => (where.id ? r.id === where.id : r.email === where.email)) ?? null;
    return Promise.resolve(row ? this.decorate(row, include) : null);
  }

  private matches(
    row: DbUser,
    where?: {
      status?: DbUser['status'];
      role?: DbUser['role'];
      email?: { contains: string; mode?: string };
    },
  ): boolean {
    if (!where) return true;
    if (where.status !== undefined && row.status !== where.status) return false;
    if (where.role !== undefined && row.role !== where.role) return false;
    if (where.email && !row.email.toLowerCase().includes(where.email.contains.toLowerCase())) {
      return false;
    }
    return true;
  }

  findMany(args: {
    where?: { status?: DbUser['status']; role?: DbUser['role']; email?: { contains: string } };
    orderBy?: { createdAt: 'asc' | 'desc' };
    skip?: number;
    take?: number;
    include?: { _count?: unknown };
  }): Promise<(DbUser & { _count?: { orders: number } })[]> {
    let rows = this.rows.filter((r) => this.matches(r, args.where));
    if (args.orderBy?.createdAt === 'desc') {
      rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    const skip = args.skip ?? 0;
    rows = rows.slice(skip, args.take !== undefined ? skip + args.take : undefined);
    return Promise.resolve(rows.map((r) => this.decorate(r, args.include)));
  }

  count({ where }: { where?: { status?: DbUser['status']; role?: DbUser['role']; email?: { contains: string } } } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => this.matches(r, where)).length);
  }

  aggregate(args: { _sum: { balance: true } }): Promise<{ _sum: { balance: Prisma.Decimal | null } }> {
    void args;
    if (this.rows.length === 0) return Promise.resolve({ _sum: { balance: null } });
    const sum = this.rows.reduce((acc, r) => acc.plus(r.balance), new Prisma.Decimal(0));
    return Promise.resolve({ _sum: { balance: sum } });
  }

  create({
    data,
  }: {
    data: Partial<DbUser> & { email: string; passwordHash: string };
  }): Promise<DbUser> {
    const now = new Date();
    const row: DbUser = {
      id: randomUUID(),
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role ?? 'user',
      status: data.status ?? 'active',
      balance: new Prisma.Decimal(0),
      locale: data.locale ?? 'en',
      emailVerifiedAt: null,
      twoFactorSecret: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: Partial<Omit<DbUser, 'balance'>> & {
      balance?:
        | Prisma.Decimal
        | { increment: Prisma.Decimal | string }
        | { decrement: Prisma.Decimal | string };
    };
  }): Promise<DbUser> {
    const row = await this.findUnique({ where });
    if (!row) throw new Error('Record not found');
    const { balance, ...rest } = data;
    Object.assign(row, rest, { updatedAt: new Date() });
    if (balance !== undefined) {
      row.balance =
        balance instanceof Prisma.Decimal
          ? balance
          : 'increment' in balance
            ? row.balance.plus(new Prisma.Decimal(balance.increment))
            : row.balance.minus(new Prisma.Decimal(balance.decrement));
    }
    return row;
  }
}

// ---------- Catalog fakes (E2) ----------

export type FakeCategoryRow = DbCategory & { translations: CategoryTranslation[] };
export type FakeProductRow = DbProduct & {
  translations: ProductTranslation[];
  variants: DbVariant[];
  category: DbCategory;
};

/**
 * Supports the query shapes CatalogService issues: findMany with optional
 * where.status / where.categoryId.in, and findFirst by slug+status.
 * `include`/`select` are ignored — rows are stored fully nested.
 */
export class FakeCategoryStore {
  readonly rows: FakeCategoryRow[] = [];

  findMany(_args?: unknown): Promise<FakeCategoryRow[]> {
    return Promise.resolve([...this.rows]);
  }
}

export class FakeProductStore {
  readonly rows: FakeProductRow[] = [];

  findMany(args?: {
    where?: { status?: string; categoryId?: { in: string[] } };
  }): Promise<FakeProductRow[]> {
    let rows = [...this.rows];
    const where = args?.where;
    if (where?.status) rows = rows.filter((r) => r.status === where.status);
    if (where?.categoryId) rows = rows.filter((r) => where.categoryId!.in.includes(r.categoryId));
    return Promise.resolve(rows);
  }

  findFirst(args: { where: { slug?: string; status?: string } }): Promise<FakeProductRow | null> {
    const { slug, status } = args.where;
    return Promise.resolve(
      this.rows.find(
        (r) =>
          (slug === undefined || r.slug === slug) && (status === undefined || r.status === status),
      ) ?? null,
    );
  }
}

/** Builders keeping fixtures terse; every unset field gets a sane default. */
export function makeCategoryRow(
  overrides: Partial<FakeCategoryRow> & { slug: string },
): FakeCategoryRow {
  return {
    id: randomUUID(),
    parentId: null,
    position: 0,
    translations: [],
    ...overrides,
  };
}

export function makeVariantRow(
  overrides: Partial<Omit<DbVariant, 'price'>> & { sku: string; price: string },
): DbVariant {
  const now = new Date();
  const fulfillmentType = overrides.fulfillmentType ?? 'READY_STOCK';
  return {
    id: randomUUID(),
    productId: randomUUID(),
    currency: 'USD',
    deliveryType: fulfillmentType === 'READY_STOCK' ? 'auto' : 'manual',
    stockCount: 0,
    isActive: true,
    attributes: {},
    goal: null,
    tier: null,
    warmingPlanId: null,
    bundleSpec: [],
    etaMinutes: null,
    warrantyHours: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
    fulfillmentType,
    price: new Prisma.Decimal(overrides.price),
  };
}

export function makeProductRow(
  overrides: Partial<Omit<FakeProductRow, 'ratingAvg'>> & {
    slug: string;
    category: DbCategory;
    ratingAvg?: string | null;
  },
): FakeProductRow {
  const now = new Date();
  const { ratingAvg, ...rest } = overrides;
  return {
    id: randomUUID(),
    categoryId: overrides.category.id,
    status: 'published',
    attributes: {},
    translations: [],
    variants: [],
    createdAt: now,
    updatedAt: now,
    ...rest,
    ratingAvg: ratingAvg == null ? null : new Prisma.Decimal(ratingAvg),
  };
}

// ---------- Wallet fakes (E3) ----------

function uniqueViolation(target: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on ${target}`, {
    code: 'P2002',
    clientVersion: 'fake',
  });
}

export class FakeLedgerStore {
  readonly rows: DbLedgerEntry[] = [];

  create({
    data,
  }: {
    data: Omit<DbLedgerEntry, 'id' | 'createdAt' | 'amount' | 'balanceAfter'> & {
      amount: Prisma.Decimal | string;
      balanceAfter: Prisma.Decimal | string;
    };
  }): Promise<DbLedgerEntry> {
    if (
      this.rows.some(
        (r) =>
          r.refType === data.refType && r.refId === data.refId && r.direction === data.direction,
      )
    ) {
      return Promise.reject(uniqueViolation('ledger_entries_refType_refId_direction_key'));
    }
    const row: DbLedgerEntry = {
      id: randomUUID(),
      createdAt: new Date(),
      ...data,
      amount: new Prisma.Decimal(data.amount),
      balanceAfter: new Prisma.Decimal(data.balanceAfter),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findMany(args?: {
    where?: { userId?: string };
    orderBy?: { createdAt?: 'asc' | 'desc' };
    skip?: number;
    take?: number;
  }): Promise<DbLedgerEntry[]> {
    let rows = this.rows.filter((r) => !args?.where?.userId || r.userId === args.where.userId);
    if (args?.orderBy?.createdAt === 'desc') rows = [...rows].reverse();
    const skip = args?.skip ?? 0;
    return Promise.resolve(
      rows.slice(skip, args?.take !== undefined ? skip + args.take : undefined),
    );
  }

  count({
    where,
  }: {
    where?: {
      userId?: string;
      direction?: DbLedgerEntry['direction'];
      refType?: DbLedgerEntry['refType'];
    };
  } = {}): Promise<number> {
    return Promise.resolve(
      this.rows.filter(
        (r) =>
          (!where?.userId || r.userId === where.userId) &&
          (!where?.direction || r.direction === where.direction) &&
          (!where?.refType || r.refType === where.refType),
      ).length,
    );
  }

  aggregate(args: {
    where: { userId: string; direction: DbLedgerEntry['direction'] };
    _sum: { amount: true };
  }): Promise<{ _sum: { amount: Prisma.Decimal | null } }> {
    const matched = this.rows.filter(
      (r) => r.userId === args.where.userId && r.direction === args.where.direction,
    );
    const sum = matched.reduce((acc, r) => acc.plus(r.amount), new Prisma.Decimal(0));
    return Promise.resolve({ _sum: { amount: matched.length ? sum : null } });
  }

  /** Finance summary groups sums by (direction, refType). */
  groupBy(args: {
    by: ['direction', 'refType'];
    _sum: { amount: true };
  }): Promise<
    { direction: DbLedgerEntry['direction']; refType: DbLedgerEntry['refType']; _sum: { amount: Prisma.Decimal | null } }[]
  > {
    void args;
    const groups = new Map<
      string,
      { direction: DbLedgerEntry['direction']; refType: DbLedgerEntry['refType']; sum: Prisma.Decimal }
    >();
    for (const row of this.rows) {
      const key = `${row.direction}\n${row.refType}`;
      const bucket = groups.get(key);
      if (bucket) bucket.sum = bucket.sum.plus(row.amount);
      else groups.set(key, { direction: row.direction, refType: row.refType, sum: row.amount });
    }
    return Promise.resolve(
      [...groups.values()].map((g) => ({
        direction: g.direction,
        refType: g.refType,
        _sum: { amount: g.sum },
      })),
    );
  }
}

type TopUpStatusFilter = DbTopUp['status'] | { in: DbTopUp['status'][] };

function matchesStatus(row: DbTopUp, filter?: TopUpStatusFilter): boolean {
  if (filter === undefined) return true;
  return typeof filter === 'string' ? row.status === filter : filter.in.includes(row.status);
}

export class FakeTopUpStore {
  readonly rows: DbTopUp[] = [];

  create({
    data,
  }: {
    data: Partial<Omit<DbTopUp, 'amount'>> & {
      userId: string;
      provider: string;
      asset: string;
      amount: Prisma.Decimal | string;
    };
  }): Promise<DbTopUp> {
    const row: DbTopUp = {
      id: randomUUID(),
      externalId: null,
      fee: null,
      status: 'pending',
      paymentUrl: null,
      address: null,
      expiresAt: null,
      createdAt: new Date(),
      paidAt: null,
      ...data,
      amount: new Prisma.Decimal(data.amount),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: Partial<DbTopUp>;
  }): Promise<DbTopUp> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    Object.assign(row, data);
    return row;
  }

  updateMany({
    where,
    data,
  }: {
    where: { id?: string; status?: TopUpStatusFilter; expiresAt?: { lt: Date } };
    data: Partial<DbTopUp>;
  }): Promise<{ count: number }> {
    const matched = this.rows.filter(
      (r) =>
        (where.id === undefined || r.id === where.id) &&
        matchesStatus(r, where.status) &&
        (where.expiresAt === undefined ||
          (r.expiresAt !== null && r.expiresAt.getTime() < where.expiresAt.lt.getTime())),
    );
    for (const row of matched) Object.assign(row, data);
    return Promise.resolve({ count: matched.length });
  }

  findUnique({ where }: { where: { id?: string; externalId?: string } }): Promise<DbTopUp | null> {
    return Promise.resolve(
      this.rows.find((r) =>
        where.id !== undefined ? r.id === where.id : r.externalId === where.externalId,
      ) ?? null,
    );
  }

  findFirst({ where }: { where: { id: string; userId: string } }): Promise<DbTopUp | null> {
    return Promise.resolve(
      this.rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null,
    );
  }
}

export class FakeIdempotencyStore {
  readonly rows: DbIdempotencyKey[] = [];

  private find(key: string, endpoint: string): DbIdempotencyKey | undefined {
    return this.rows.find((r) => r.key === key && r.endpoint === endpoint);
  }

  create({
    data,
  }: {
    data: Pick<DbIdempotencyKey, 'key' | 'endpoint' | 'requestHash'> & { userId?: string | null };
  }): Promise<DbIdempotencyKey> {
    if (this.find(data.key, data.endpoint)) {
      return Promise.reject(uniqueViolation('idempotency_keys_key_endpoint_key'));
    }
    const row: DbIdempotencyKey = {
      id: randomUUID(),
      userId: data.userId ?? null,
      responseCode: null,
      responseBody: null,
      createdAt: new Date(),
      ...data,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findUnique({
    where,
  }: {
    where: { key_endpoint: { key: string; endpoint: string } };
  }): Promise<DbIdempotencyKey | null> {
    return Promise.resolve(this.find(where.key_endpoint.key, where.key_endpoint.endpoint) ?? null);
  }

  async update({
    where,
    data,
  }: {
    where: { key_endpoint: { key: string; endpoint: string } };
    data: Partial<DbIdempotencyKey>;
  }): Promise<DbIdempotencyKey> {
    const row = this.find(where.key_endpoint.key, where.key_endpoint.endpoint);
    if (!row) throw new Error('Record not found');
    Object.assign(row, data);
    return row;
  }

  async delete({
    where,
  }: {
    where: { key_endpoint: { key: string; endpoint: string } };
  }): Promise<DbIdempotencyKey> {
    const row = this.find(where.key_endpoint.key, where.key_endpoint.endpoint);
    if (!row) throw new Error('Record not found');
    this.rows.splice(this.rows.indexOf(row), 1);
    return row;
  }
}

// ---------- Cart & orders fakes (E4) ----------

type VariantWithProduct = DbVariant & { product: FakeProductRow };

/**
 * Variant lookups for the cart/checkout flows. Rows are the same objects as
 * FakeProductStore.rows[].variants, so stock decrements stay in sync.
 */
export class FakeVariantStore {
  readonly rows: DbVariant[] = [];

  constructor(private readonly products: FakeProductStore) {}

  /** Row + its product (with translations) — the include the cart flows use. */
  withProduct(row: DbVariant): VariantWithProduct {
    const product = this.products.rows.find((p) => p.id === row.productId);
    if (!product) throw new Error(`FakeVariantStore: product ${row.productId} not seeded`);
    return { ...row, product };
  }

  /** Convenience for sibling stores resolving variantId → variant+product. */
  resolve(variantId: string): VariantWithProduct {
    const row = this.rows.find((v) => v.id === variantId);
    if (!row) throw new Error(`FakeVariantStore: variant ${variantId} not seeded`);
    return this.withProduct(row);
  }

  findUnique({
    where,
    include,
  }: {
    where: { id: string };
    include?: unknown;
  }): Promise<DbVariant | VariantWithProduct | null> {
    const row = this.rows.find((r) => r.id === where.id) ?? null;
    if (!row) return Promise.resolve(null);
    return Promise.resolve(include ? this.withProduct(row) : row);
  }

  /** Admin stock import scopes the variant to its product. */
  findFirst({ where }: { where: { id: string; productId?: string } }): Promise<DbVariant | null> {
    return Promise.resolve(
      this.rows.find(
        (r) =>
          r.id === where.id && (where.productId === undefined || r.productId === where.productId),
      ) ?? null,
    );
  }

  /** Supports the checkout guard: id + isActive + optional stockCount >= qty. */
  updateMany({
    where,
    data,
  }: {
    where: { id: string; isActive?: boolean; stockCount?: { gte: number } };
    data: { stockCount?: { decrement: number }; updatedAt?: Date };
  }): Promise<{ count: number }> {
    const matched = this.rows.filter(
      (r) =>
        r.id === where.id &&
        (where.isActive === undefined || r.isActive === where.isActive) &&
        (where.stockCount === undefined || r.stockCount >= where.stockCount.gte),
    );
    for (const row of matched) {
      if (data.stockCount) row.stockCount -= data.stockCount.decrement;
      if (data.updatedAt) row.updatedAt = data.updatedAt;
    }
    return Promise.resolve({ count: matched.length });
  }

  /** StockService recomputes the stockCount cache from the pool via update. */
  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: { stockCount?: number };
  }): Promise<DbVariant> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    Object.assign(row, data);
    return row;
  }
}

type FakeCartItemWithVariant = DbCartItem & { variant: VariantWithProduct };

export class FakeCartStore {
  readonly rows: DbCart[] = [];

  constructor(private readonly items: FakeCartItemStore) {}

  findUnique({
    where,
    include,
  }: {
    where: { userId: string };
    include?: unknown;
  }): Promise<(DbCart & { items?: FakeCartItemWithVariant[] }) | null> {
    const row = this.rows.find((r) => r.userId === where.userId) ?? null;
    if (!row) return Promise.resolve(null);
    if (!include) return Promise.resolve(row);
    return Promise.resolve({ ...row, items: this.items.forCart(row.id) });
  }

  create({ data }: { data: { userId: string } }): Promise<DbCart> {
    if (this.rows.some((r) => r.userId === data.userId)) {
      return Promise.reject(uniqueViolation('carts_userId_key'));
    }
    const now = new Date();
    const row: DbCart = { id: randomUUID(), userId: data.userId, createdAt: now, updatedAt: now };
    this.rows.push(row);
    return Promise.resolve(row);
  }
}

export class FakeCartItemStore {
  readonly rows: DbCartItem[] = [];

  constructor(
    private readonly variants: FakeVariantStore,
    private readonly carts: () => FakeCartStore,
  ) {}

  /** Items of a cart with the variant+product include, oldest first. */
  forCart(cartId: string): FakeCartItemWithVariant[] {
    return this.rows
      .filter((r) => r.cartId === cartId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => ({ ...r, variant: this.variants.resolve(r.variantId) }));
  }

  create({
    data,
  }: {
    data: { cartId: string; variantId: string; quantity: number };
  }): Promise<DbCartItem> {
    if (this.rows.some((r) => r.cartId === data.cartId && r.variantId === data.variantId)) {
      return Promise.reject(uniqueViolation('cart_items_cartId_variantId_key'));
    }
    const row: DbCartItem = { id: randomUUID(), createdAt: new Date(), ...data };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: { quantity: number };
  }): Promise<DbCartItem> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    Object.assign(row, data);
    return row;
  }

  findFirst({
    where,
  }: {
    where: { id: string; cart: { userId: string } };
    include?: unknown;
  }): Promise<FakeCartItemWithVariant | null> {
    const cart = this.carts().rows.find((c) => c.userId === where.cart.userId);
    const row = this.rows.find((r) => r.id === where.id && r.cartId === cart?.id) ?? null;
    if (!row) return Promise.resolve(null);
    return Promise.resolve({ ...row, variant: this.variants.resolve(row.variantId) });
  }

  async delete({ where }: { where: { id: string } }): Promise<DbCartItem> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    this.rows.splice(this.rows.indexOf(row), 1);
    return row;
  }

  deleteMany({ where }: { where: { cartId: string } }): Promise<{ count: number }> {
    const matched = this.rows.filter((r) => r.cartId === where.cartId);
    for (const row of matched) this.rows.splice(this.rows.indexOf(row), 1);
    return Promise.resolve({ count: matched.length });
  }
}

export class FakePromoStore {
  readonly rows: DbPromoCode[] = [];

  findUnique({ where }: { where: { code?: string; id?: string } }): Promise<DbPromoCode | null> {
    return Promise.resolve(
      this.rows.find((r) =>
        where.code !== undefined ? r.code === where.code : r.id === where.id,
      ) ?? null,
    );
  }

  findMany(args?: { orderBy?: { createdAt: 'asc' | 'desc' } }): Promise<DbPromoCode[]> {
    let rows = [...this.rows];
    if (args?.orderBy?.createdAt === 'desc') {
      rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return Promise.resolve(rows);
  }

  create({
    data,
  }: {
    data: Partial<Omit<DbPromoCode, 'value'>> & {
      code: string;
      type: DbPromoCode['type'];
      value: Prisma.Decimal | string;
    };
  }): Promise<DbPromoCode> {
    if (this.rows.some((r) => r.code === data.code)) {
      return Promise.reject(uniqueViolation('promo_codes_code_key'));
    }
    const row: DbPromoCode = {
      id: randomUUID(),
      maxUses: null,
      usedCount: 0,
      expiresAt: null,
      createdAt: new Date(),
      ...data,
      value: new Prisma.Decimal(data.value),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: Partial<Omit<DbPromoCode, 'value'>> & { value?: Prisma.Decimal | string };
  }): Promise<DbPromoCode> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    const { value, ...rest } = data;
    Object.assign(row, rest);
    if (value !== undefined) row.value = new Prisma.Decimal(value);
    return row;
  }

  delete({ where }: { where: { id: string } }): Promise<DbPromoCode> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    this.rows.splice(this.rows.indexOf(row), 1);
    return Promise.resolve(row);
  }

  /**
   * Interprets only the guard shape OrdersService issues: id + still-valid
   * (maxUses/usedCount, expiresAt) → increment usedCount.
   */
  updateMany({
    where,
    data,
  }: {
    where: { id: string };
    data: { usedCount: { increment: number } };
  }): Promise<{ count: number }> {
    const row = this.rows.find((r) => r.id === where.id);
    const valid =
      row &&
      (row.maxUses === null || row.usedCount < row.maxUses) &&
      (row.expiresAt === null || row.expiresAt.getTime() > Date.now());
    if (!valid) return Promise.resolve({ count: 0 });
    row.usedCount += data.usedCount.increment;
    return Promise.resolve({ count: 1 });
  }
}

type FakeOrderItemWithWarming = DbOrderItem & {
  warmingJob: (DbWarmingJob & { tasks: DbWarmingTask[] }) | null;
};
type FakeOrderWithRels = DbOrder & {
  items: FakeOrderItemWithWarming[];
  promoCode: DbPromoCode | null;
  user: Pick<DbUser, 'id' | 'email'> | null;
};

/** Admin order list where (status + free-text on number/email); all optional. */
interface AdminOrderWhere {
  userId?: string;
  status?: DbOrder['status'];
  OR?: {
    number?: { contains: string; mode?: string };
    user?: { email: { contains: string; mode?: string } };
  }[];
}

export class FakeOrderStore {
  readonly rows: DbOrder[] = [];

  constructor(
    private readonly items: FakeOrderItemStore,
    private readonly promos: FakePromoStore,
    private readonly warming: () => FakeWarmingJobStore,
    private readonly users: () => FakeUserStore = () => new FakeUserStore(),
  ) {}

  private withRels(row: DbOrder): FakeOrderWithRels {
    const buyer = this.users().rows.find((u) => u.id === row.userId) ?? null;
    return {
      user: buyer ? { id: buyer.id, email: buyer.email } : null,
      ...row,
      items: this.items.rows
        .filter((i) => i.orderId === row.id)
        .map((i) => ({ ...i, warmingJob: this.warming().forOrderItem(i.id) })),
      promoCode: this.promos.rows.find((p) => p.id === row.promoCodeId) ?? null,
    };
  }

  findUnique({
    where,
  }: {
    where: { id: string };
    include?: unknown;
  }): Promise<FakeOrderWithRels | null> {
    const row = this.rows.find((r) => r.id === where.id) ?? null;
    return Promise.resolve(row ? this.withRels(row) : null);
  }

  create({
    data,
  }: {
    data: Omit<DbOrder, 'id' | 'createdAt' | 'updatedAt' | 'subtotal' | 'discount' | 'total'> & {
      subtotal: Prisma.Decimal | string;
      discount: Prisma.Decimal | string;
      total: Prisma.Decimal | string;
      items?: {
        create: (Omit<DbOrderItem, 'id' | 'orderId' | 'unitPrice'> & {
          unitPrice: Prisma.Decimal | string;
        })[];
      };
    };
    include?: unknown;
  }): Promise<FakeOrderWithRels> {
    if (this.rows.some((r) => r.number === data.number)) {
      return Promise.reject(uniqueViolation('orders_number_key'));
    }
    const now = new Date();
    const { items, ...orderData } = data;
    const row: DbOrder = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...orderData,
      subtotal: new Prisma.Decimal(data.subtotal),
      discount: new Prisma.Decimal(data.discount),
      total: new Prisma.Decimal(data.total),
    };
    this.rows.push(row);
    for (const item of items?.create ?? []) {
      this.items.rows.push({
        id: randomUUID(),
        orderId: row.id,
        ...item,
        unitPrice: new Prisma.Decimal(item.unitPrice),
      });
    }
    return Promise.resolve(this.withRels(row));
  }

  /** Matches both the buyer scope ({userId}) and the admin filters (status/OR). */
  private matches(row: DbOrder, where: AdminOrderWhere = {}): boolean {
    if (where.userId !== undefined && row.userId !== where.userId) return false;
    if (where.status !== undefined && row.status !== where.status) return false;
    if (where.OR) {
      const buyer = this.users().rows.find((u) => u.id === row.userId);
      const hit = where.OR.some((clause) => {
        if (clause.number) {
          return row.number.toLowerCase().includes(clause.number.contains.toLowerCase());
        }
        if (clause.user) {
          return (buyer?.email ?? '')
            .toLowerCase()
            .includes(clause.user.email.contains.toLowerCase());
        }
        return false;
      });
      if (!hit) return false;
    }
    return true;
  }

  findMany(args: {
    where?: AdminOrderWhere;
    include?: unknown;
    orderBy?: { createdAt: 'asc' | 'desc' };
    skip?: number;
    take?: number;
  }): Promise<FakeOrderWithRels[]> {
    let rows = this.rows.filter((r) => this.matches(r, args.where));
    if (args.orderBy?.createdAt === 'desc') rows = [...rows].reverse();
    const skip = args.skip ?? 0;
    rows = rows.slice(skip, args.take !== undefined ? skip + args.take : undefined);
    return Promise.resolve(rows.map((row) => this.withRels(row)));
  }

  count({ where }: { where?: AdminOrderWhere } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => this.matches(r, where)).length);
  }

  findFirst({
    where,
  }: {
    where: { id: string; userId: string };
    include?: unknown;
  }): Promise<FakeOrderWithRels | null> {
    const row = this.rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null;
    return Promise.resolve(row ? this.withRels(row) : null);
  }

  /** Checkout updates the status once its line delivery states are known. */
  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: Partial<DbOrder>;
  }): Promise<DbOrder> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    Object.assign(row, data);
    return row;
  }
}

type FakeOrderItemWithDeliveries = DbOrderItem & { deliveries: DbDelivery[] };

export class FakeOrderItemStore {
  readonly rows: DbOrderItem[] = [];

  constructor(
    private readonly orders: () => FakeOrderStore,
    private readonly deliveries: () => FakeDeliveryStore,
    private readonly warming: () => FakeWarmingJobStore | undefined = () => undefined,
  ) {}

  /** getDelivery: item by id scoped to its order's owner, with deliveries. */
  findFirst({
    where,
    include,
  }: {
    where: { id: string; orderId?: string; order?: { userId: string } };
    include?: { deliveries?: unknown; warmingJob?: unknown };
  }): Promise<FakeOrderItemWithDeliveries | DbOrderItem | null> {
    const row = this.rows.find(
      (r) => r.id === where.id && (where.orderId === undefined || r.orderId === where.orderId),
    );
    if (!row) return Promise.resolve(null);
    if (where.order?.userId !== undefined) {
      const order = this.orders().rows.find((o) => o.id === row.orderId);
      if (!order || order.userId !== where.order.userId) return Promise.resolve(null);
    }
    if (!include?.deliveries && !include?.warmingJob) return Promise.resolve(row);
    const decorated: Record<string, unknown> = { ...row };
    if (include?.deliveries) decorated.deliveries = this.deliveries().forOrderItem(row.id);
    if (include?.warmingJob) decorated.warmingJob = this.warming()?.forOrderItem(row.id) ?? null;
    return Promise.resolve(decorated as FakeOrderItemWithDeliveries);
  }

  findUnique({ where }: { where: { id: string } }): Promise<DbOrderItem | null> {
    return Promise.resolve(this.rows.find((r) => r.id === where.id) ?? null);
  }

  /** syncDeliveryStatus reads sibling line statuses to aggregate the order. */
  findMany(args: { where: { orderId: string }; select?: unknown }): Promise<DbOrderItem[]> {
    return Promise.resolve(this.rows.filter((r) => r.orderId === args.where.orderId));
  }

  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: Partial<DbOrderItem>;
  }): Promise<DbOrderItem> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    Object.assign(row, data);
    return row;
  }
}

// ---------- Warming fakes (E6) ----------

type PlanWithStages = DbWarmingPlan & { stages: DbWarmingStageTemplate[] };

export class FakeWarmingPlanStore {
  readonly rows: PlanWithStages[] = [];

  /** createJobForItem loads the plan with its stages ordered. */
  findUnique({
    where,
  }: {
    where: { id: string };
    include?: unknown;
  }): Promise<PlanWithStages | null> {
    const row = this.rows.find((r) => r.id === where.id) ?? null;
    if (!row) return Promise.resolve(null);
    return Promise.resolve({ ...row, stages: [...row.stages].sort((a, b) => a.order - b.order) });
  }
}

/** Build a warming plan row with ordered stages for tests. */
export function makeWarmingPlanRow(overrides: {
  goal: string;
  tier?: string | null;
  name?: string;
  version?: number;
  stages: { name: string; expectedMinutes: number }[];
}): PlanWithStages {
  const now = new Date();
  const id = randomUUID();
  return {
    id,
    goal: overrides.goal,
    tier: overrides.tier ?? null,
    name: overrides.name ?? 'Test plan',
    version: overrides.version ?? 1,
    isActive: true,
    qcRules: {},
    createdAt: now,
    updatedAt: now,
    stages: overrides.stages.map((s, order) => ({
      id: randomUUID(),
      planId: id,
      order,
      name: s.name,
      expectedMinutes: s.expectedMinutes,
      checklist: [],
      requiredComponents: [],
    })),
  };
}

interface WarmingJobWhere {
  status?: DbWarmingJob['status'];
  goal?: string;
  assignedTo?: string;
}

function matchesJob(row: DbWarmingJob, where: WarmingJobWhere): boolean {
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.goal !== undefined && row.goal !== where.goal) return false;
  if (where.assignedTo !== undefined && row.assignedTo !== where.assignedTo) return false;
  return true;
}

type JobWithRels = DbWarmingJob & {
  orderItem: DbOrderItem & {
    order: { id: string; number: string; userId: string };
    variant: { tier: string | null };
  };
  tasks: DbWarmingTask[];
  accountAsset: { id: string } | null;
  bundle: { status: string } | null;
};

export class FakeWarmingJobStore {
  readonly rows: DbWarmingJob[] = [];

  constructor(
    private readonly tasks: () => FakeWarmingTaskStore,
    private readonly orderItems: () => FakeOrderItemStore,
    private readonly orders: () => FakeOrderStore,
    private readonly variants: () => FakeVariantStore,
    private readonly accountAssets: () => FakeAccountAssetStore,
    private readonly bundles: () => FakeBundleStore,
  ) {}

  /** Full job row + its tasks (for order buyer progress); null if none. */
  forOrderItem(orderItemId: string): (DbWarmingJob & { tasks: DbWarmingTask[] }) | null {
    const row = this.rows.find((r) => r.orderItemId === orderItemId);
    if (!row) return null;
    return { ...row, tasks: this.tasks().forJob(row.id) };
  }

  private withRels(job: DbWarmingJob): JobWithRels {
    const item = this.orderItems().rows.find((i) => i.id === job.orderItemId)!;
    const order = this.orders().rows.find((o) => o.id === item.orderId)!;
    const variant = this.variants().rows.find((v) => v.id === item.variantId) ?? null;
    const asset = this.accountAssets().rows.find((a) => a.jobId === job.id) ?? null;
    const bundle = this.bundles().rows.find((b) => b.jobId === job.id) ?? null;
    return {
      ...job,
      orderItem: {
        ...item,
        order: { id: order.id, number: order.number, userId: order.userId },
        variant: { tier: variant?.tier ?? null },
      },
      tasks: this.tasks().forJob(job.id),
      accountAsset: asset ? { id: asset.id } : null,
      bundle: bundle ? { status: bundle.status } : null,
    };
  }

  create({
    data,
  }: {
    data: Partial<DbWarmingJob> & { orderItemId: string; planVersion: number };
  }): Promise<DbWarmingJob> {
    const now = new Date();
    const row: DbWarmingJob = {
      id: randomUUID(),
      orderItemId: data.orderItemId,
      planId: data.planId ?? null,
      planVersion: data.planVersion,
      goal: data.goal ?? null,
      status: data.status ?? 'queued',
      assignedTo: data.assignedTo ?? null,
      etaAt: data.etaAt ?? null,
      slaDueAt: data.slaDueAt ?? null,
      startedAt: data.startedAt ?? null,
      readyAt: data.readyAt ?? null,
      deliveredAt: data.deliveredAt ?? null,
      currentStage: data.currentStage ?? 0,
      stageCount: data.stageCount ?? 0,
      stagesSnapshot: (data.stagesSnapshot ?? []) as DbWarmingJob['stagesSnapshot'],
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findUnique({
    where,
    include,
  }: {
    where: { id: string };
    include?: unknown;
  }): Promise<JobWithRels | DbWarmingJob | null> {
    const row = this.rows.find((r) => r.id === where.id) ?? null;
    if (!row) return Promise.resolve(null);
    return Promise.resolve(include ? this.withRels(row) : row);
  }

  findMany(args: {
    where?: WarmingJobWhere;
    include?: unknown;
    orderBy?: { createdAt?: 'asc' | 'desc' };
    skip?: number;
    take?: number;
  }): Promise<JobWithRels[]> {
    let rows = this.rows.filter((r) => matchesJob(r, args.where ?? {}));
    rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (args.orderBy?.createdAt === 'desc') rows.reverse();
    const skip = args.skip ?? 0;
    rows = rows.slice(skip, args.take !== undefined ? skip + args.take : undefined);
    return Promise.resolve(rows.map((r) => this.withRels(r)));
  }

  count({ where }: { where?: WarmingJobWhere } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => matchesJob(r, where ?? {})).length);
  }

  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: Partial<DbWarmingJob>;
  }): Promise<DbWarmingJob> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    Object.assign(row, data, { updatedAt: new Date() });
    return row;
  }
}

export class FakeWarmingTaskStore {
  readonly rows: DbWarmingTask[] = [];

  forJob(jobId: string): DbWarmingTask[] {
    return this.rows.filter((r) => r.jobId === jobId).sort((a, b) => a.order - b.order);
  }

  create({
    data,
  }: {
    data: Partial<DbWarmingTask> & {
      jobId: string;
      order: number;
      name: string;
      expectedMinutes: number;
    };
  }): Promise<DbWarmingTask> {
    const row: DbWarmingTask = {
      id: randomUUID(),
      jobId: data.jobId,
      stageTemplateId: data.stageTemplateId ?? null,
      order: data.order,
      name: data.name,
      expectedMinutes: data.expectedMinutes,
      status: data.status ?? 'pending',
      checklistState: (data.checklistState ?? {}) as DbWarmingTask['checklistState'],
      startedAt: data.startedAt ?? null,
      doneAt: data.doneAt ?? null,
      operatorId: data.operatorId ?? null,
      attachments: (data.attachments ?? []) as DbWarmingTask['attachments'],
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: Partial<DbWarmingTask>;
  }): Promise<DbWarmingTask> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    Object.assign(row, data);
    return row;
  }

  updateMany({
    where,
    data,
  }: {
    where: { jobId: string };
    data: Partial<DbWarmingTask>;
  }): Promise<{ count: number }> {
    const matched = this.rows.filter((r) => r.jobId === where.jobId);
    for (const row of matched) Object.assign(row, data);
    return Promise.resolve({ count: matched.length });
  }

  count({
    where,
  }: {
    where: { jobId: string; status?: DbWarmingTask['status'] };
  }): Promise<number> {
    return Promise.resolve(
      this.rows.filter(
        (r) => r.jobId === where.jobId && (where.status === undefined || r.status === where.status),
      ).length,
    );
  }
}

export class FakeAccountAssetStore {
  readonly rows: DbAccountAsset[] = [];

  findUnique({ where }: { where: { jobId: string } }): Promise<DbAccountAsset | null> {
    return Promise.resolve(this.rows.find((r) => r.jobId === where.jobId) ?? null);
  }

  upsert({
    where,
    create,
    update,
  }: {
    where: { jobId: string };
    create: Partial<DbAccountAsset> & { jobId: string; payload: string };
    update: Partial<DbAccountAsset>;
  }): Promise<DbAccountAsset> {
    const existing = this.rows.find((r) => r.jobId === where.jobId);
    if (existing) {
      Object.assign(existing, update, { updatedAt: new Date() });
      return Promise.resolve(existing);
    }
    const now = new Date();
    const row: DbAccountAsset = {
      id: randomUUID(),
      jobId: create.jobId,
      payload: create.payload,
      recovery: create.recovery ?? null,
      meta: (create.meta ?? {}) as DbAccountAsset['meta'],
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }
}

export class FakeBundleStore {
  readonly rows: DbBundle[] = [];

  create({ data }: { data: Partial<DbBundle> & { jobId: string } }): Promise<DbBundle> {
    const now = new Date();
    const row: DbBundle = {
      id: randomUUID(),
      jobId: data.jobId,
      status: data.status ?? 'assembling',
      assembledBy: data.assembledBy ?? null,
      qcBy: data.qcBy ?? null,
      deliveredAt: data.deliveredAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }
}

export class FakeBundleComponentStore {
  readonly rows: DbBundleComponent[] = [];

  create({
    data,
  }: {
    data: Partial<DbBundleComponent> & { bundleId: string; type: DbBundleComponent['type'] };
  }): Promise<DbBundleComponent> {
    const row: DbBundleComponent = {
      id: randomUUID(),
      bundleId: data.bundleId,
      type: data.type,
      refId: data.refId ?? null,
      payload: data.payload ?? null,
      meta: (data.meta ?? {}) as DbBundleComponent['meta'],
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }
}

// ---------- Inventory: proxy & Octo fakes (E7) ----------

interface ProxyWhere {
  id?: string;
  credentialsHash?: string;
  assignedJobId?: string | null;
  status?: DbProxyItem['status'];
  type?: DbProxyItem['type'];
}

function matchesProxy(row: DbProxyItem, where: ProxyWhere): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.credentialsHash !== undefined && row.credentialsHash !== where.credentialsHash) {
    return false;
  }
  if (where.assignedJobId !== undefined && row.assignedJobId !== where.assignedJobId) return false;
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.type !== undefined && row.type !== where.type) return false;
  return true;
}

export class FakeProxyItemStore {
  readonly rows: DbProxyItem[] = [];

  create({
    data,
  }: {
    data: Partial<DbProxyItem> & {
      type: DbProxyItem['type'];
      geo: string;
      provider: string;
      credentials: string;
      credentialsHash: string;
    };
  }): Promise<DbProxyItem> {
    if (this.rows.some((r) => r.credentialsHash === data.credentialsHash)) {
      return Promise.reject(uniqueViolation('proxy_items_credentialsHash_key'));
    }
    const now = new Date();
    const row: DbProxyItem = {
      id: randomUUID(),
      type: data.type,
      geo: data.geo,
      provider: data.provider,
      credentials: data.credentials,
      credentialsHash: data.credentialsHash,
      status: data.status ?? 'available',
      expiresAt: data.expiresAt ?? null,
      assignedJobId: data.assignedJobId ?? null,
      meta: (data.meta ?? {}) as DbProxyItem['meta'],
      createdBy: data.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findUnique({
    where,
  }: {
    where: { id?: string; credentialsHash?: string; assignedJobId?: string };
  }): Promise<DbProxyItem | null> {
    return Promise.resolve(this.rows.find((r) => matchesProxy(r, where)) ?? null);
  }

  findMany(args: {
    where?: ProxyWhere;
    orderBy?: { createdAt?: 'asc' | 'desc' };
    skip?: number;
    take?: number;
  }): Promise<DbProxyItem[]> {
    let rows = this.rows.filter((r) => matchesProxy(r, args.where ?? {}));
    rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (args.orderBy?.createdAt !== 'asc') rows.reverse();
    const skip = args.skip ?? 0;
    rows = rows.slice(skip, args.take !== undefined ? skip + args.take : undefined);
    return Promise.resolve(rows);
  }

  count({ where }: { where?: ProxyWhere } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => matchesProxy(r, where ?? {})).length);
  }

  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: Partial<DbProxyItem>;
  }): Promise<DbProxyItem> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    Object.assign(row, data, { updatedAt: new Date() });
    return row;
  }

  updateMany({
    where,
    data,
  }: {
    where: ProxyWhere;
    data: Partial<DbProxyItem>;
  }): Promise<{ count: number }> {
    const matched = this.rows.filter((r) => matchesProxy(r, where));
    for (const row of matched) Object.assign(row, data, { updatedAt: new Date() });
    return Promise.resolve({ count: matched.length });
  }
}

interface OctoWhere {
  id?: string;
  jobId?: string | { in?: never } | null;
  status?: DbOctoProfile['status'] | { in: DbOctoProfile['status'][] };
}

function matchesOcto(row: DbOctoProfile, where: OctoWhere): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.jobId !== undefined && row.jobId !== where.jobId) return false;
  if (where.status !== undefined) {
    if (typeof where.status === 'object') {
      if (!where.status.in.includes(row.status)) return false;
    } else if (row.status !== where.status) {
      return false;
    }
  }
  return true;
}

export class FakeOctoProfileStore {
  readonly rows: DbOctoProfile[] = [];

  create({ data }: { data: Partial<DbOctoProfile> & { name: string } }): Promise<DbOctoProfile> {
    const now = new Date();
    const row: DbOctoProfile = {
      id: randomUUID(),
      externalId: data.externalId ?? null,
      name: data.name,
      proxyItemId: data.proxyItemId ?? null,
      jobId: data.jobId ?? null,
      status: data.status ?? 'draft',
      exportRef: data.exportRef ?? null,
      fingerprintRef: (data.fingerprintRef ?? null) as DbOctoProfile['fingerprintRef'],
      meta: (data.meta ?? {}) as DbOctoProfile['meta'],
      createdBy: data.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findUnique({ where }: { where: { id?: string; jobId?: string } }): Promise<DbOctoProfile | null> {
    return Promise.resolve(this.rows.find((r) => matchesOcto(r, where)) ?? null);
  }

  findMany(args: {
    where?: OctoWhere;
    orderBy?: { createdAt?: 'asc' | 'desc' };
    skip?: number;
    take?: number;
  }): Promise<DbOctoProfile[]> {
    let rows = this.rows.filter((r) => matchesOcto(r, args.where ?? {}));
    rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (args.orderBy?.createdAt !== 'asc') rows.reverse();
    const skip = args.skip ?? 0;
    rows = rows.slice(skip, args.take !== undefined ? skip + args.take : undefined);
    return Promise.resolve(rows);
  }

  count({ where }: { where?: OctoWhere } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => matchesOcto(r, where ?? {})).length);
  }

  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: Partial<DbOctoProfile> & {
      proxyItem?: { connect?: { id: string }; disconnect?: boolean };
    };
  }): Promise<DbOctoProfile> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    const { proxyItem, ...rest } = data;
    Object.assign(row, rest, { updatedAt: new Date() });
    if (proxyItem?.connect) row.proxyItemId = proxyItem.connect.id;
    if (proxyItem?.disconnect) row.proxyItemId = null;
    // Prisma.DbNull sentinel on fingerprintRef → JSON null in our fake.
    if ((rest as { fingerprintRef?: unknown }).fingerprintRef === Prisma.DbNull) {
      row.fingerprintRef = null as DbOctoProfile['fingerprintRef'];
    }
    return row;
  }

  updateMany({
    where,
    data,
  }: {
    where: OctoWhere;
    data: Partial<DbOctoProfile>;
  }): Promise<{ count: number }> {
    const matched = this.rows.filter((r) => matchesOcto(r, where));
    for (const row of matched) Object.assign(row, data, { updatedAt: new Date() });
    return Promise.resolve({ count: matched.length });
  }
}

// ---------- Stock, delivery & audit fakes (E5) ----------

interface StockWhere {
  id?: string | { in: string[] };
  variantId?: string;
  status?: DbStockItem['status'];
  reservedUntil?: { lt: Date };
}

/** Matches the where shapes StockService issues (reserve/sell/release/sweep/count). */
function matchesStock(row: DbStockItem, where: StockWhere): boolean {
  if (where.id !== undefined) {
    if (typeof where.id === 'string') {
      if (row.id !== where.id) return false;
    } else if (!where.id.in.includes(row.id)) {
      return false;
    }
  }
  if (where.variantId !== undefined && row.variantId !== where.variantId) return false;
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.reservedUntil?.lt !== undefined) {
    if (
      row.reservedUntil === null ||
      row.reservedUntil.getTime() >= where.reservedUntil.lt.getTime()
    ) {
      return false;
    }
  }
  return true;
}

export class FakeStockItemStore {
  readonly rows: DbStockItem[] = [];

  create({
    data,
  }: {
    data: {
      variantId: string;
      payload: string;
      payloadHash: string;
      status?: DbStockItem['status'];
    };
  }): Promise<DbStockItem> {
    if (
      this.rows.some((r) => r.variantId === data.variantId && r.payloadHash === data.payloadHash)
    ) {
      return Promise.reject(uniqueViolation('stock_items_variantId_payloadHash_key'));
    }
    const row: DbStockItem = {
      id: randomUUID(),
      status: data.status ?? 'available',
      reservedUntil: null,
      orderItemId: null,
      createdAt: new Date(),
      ...data,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findMany(args: {
    where?: StockWhere;
    orderBy?: { createdAt?: 'asc' | 'desc' };
    take?: number;
    select?: unknown;
  }): Promise<DbStockItem[]> {
    let rows = this.rows.filter((r) => matchesStock(r, args.where ?? {}));
    if (args.orderBy?.createdAt === 'asc') {
      rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    } else if (args.orderBy?.createdAt === 'desc') {
      rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    if (args.take !== undefined) rows = rows.slice(0, args.take);
    // Return the canonical rows so callers read live variantId/id; they never mutate them.
    return Promise.resolve(rows);
  }

  findUnique({ where }: { where: { id: string } }): Promise<DbStockItem | null> {
    return Promise.resolve(this.rows.find((r) => r.id === where.id) ?? null);
  }

  updateMany({
    where,
    data,
  }: {
    where: StockWhere;
    data: Partial<Pick<DbStockItem, 'status' | 'reservedUntil' | 'orderItemId'>>;
  }): Promise<{ count: number }> {
    const matched = this.rows.filter((r) => matchesStock(r, where));
    for (const row of matched) Object.assign(row, data);
    return Promise.resolve({ count: matched.length });
  }

  count({ where }: { where?: StockWhere } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => matchesStock(r, where ?? {})).length);
  }
}

export class FakeDeliveryStore {
  readonly rows: DbDelivery[] = [];

  create({
    data,
  }: {
    data: {
      orderItemId: string;
      payload: string;
      type: DbDelivery['type'];
      stockItemId?: string | null;
      bundleId?: string | null;
      deliveredBy?: string | null;
      deliveredAt?: Date | null;
    };
  }): Promise<DbDelivery> {
    const row: DbDelivery = {
      id: randomUUID(),
      stockItemId: data.stockItemId ?? null,
      bundleId: data.bundleId ?? null,
      deliveredBy: data.deliveredBy ?? null,
      deliveredAt: data.deliveredAt ?? null,
      createdAt: new Date(),
      ...data,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  /** Deliveries of one order item, oldest first (matches the getDelivery include). */
  forOrderItem(orderItemId: string): DbDelivery[] {
    return this.rows
      .filter((r) => r.orderItemId === orderItemId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export class FakeAuditStore {
  readonly rows: DbAuditLog[] = [];

  create({
    data,
  }: {
    data: {
      action: string;
      entity: string;
      actorId?: string | null;
      entityId?: string | null;
      diff?: Prisma.InputJsonValue;
    };
  }): Promise<DbAuditLog> {
    const row: DbAuditLog = {
      id: randomUUID(),
      action: data.action,
      entity: data.entity,
      actorId: data.actorId ?? null,
      entityId: data.entityId ?? null,
      diff: (data.diff ?? {}) as Prisma.JsonValue,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }
}

export interface FakePrismaStores {
  user: FakeUserStore;
  category: FakeCategoryStore;
  product: FakeProductStore;
  productVariant: FakeVariantStore;
  cart: FakeCartStore;
  cartItem: FakeCartItemStore;
  order: FakeOrderStore;
  orderItem: FakeOrderItemStore;
  promoCode: FakePromoStore;
  ledgerEntry: FakeLedgerStore;
  topUp: FakeTopUpStore;
  idempotencyKey: FakeIdempotencyStore;
  stockItem: FakeStockItemStore;
  delivery: FakeDeliveryStore;
  auditLog: FakeAuditStore;
  warmingPlan: FakeWarmingPlanStore;
  warmingJob: FakeWarmingJobStore;
  warmingTask: FakeWarmingTaskStore;
  accountAsset: FakeAccountAssetStore;
  bundle: FakeBundleStore;
  bundleComponent: FakeBundleComponentStore;
  proxyItem: FakeProxyItemStore;
  octoProfile: FakeOctoProfileStore;
}

interface StoreSnapshot {
  rows: unknown[];
  entries: { ref: Record<string, unknown>; data: Record<string, unknown> }[];
}

/**
 * In-place snapshot/restore keeps object identity intact — product rows share
 * variant row objects with the variant store, so restoring must mutate the
 * original rows rather than replace them with clones.
 */
function takeSnapshot(stores: FakePrismaStores): StoreSnapshot[] {
  return Object.values(stores)
    .map((store) => (store as { rows?: unknown[] }).rows)
    .filter((rows): rows is unknown[] => Array.isArray(rows))
    .map((rows) => ({
      rows,
      entries: rows.map((row) => ({
        ref: row as Record<string, unknown>,
        data: { ...(row as Record<string, unknown>) },
      })),
    }));
}

function restoreSnapshot(snapshots: StoreSnapshot[]): void {
  for (const { rows, entries } of snapshots) {
    rows.splice(0, rows.length, ...entries.map((e) => e.ref));
    for (const { ref, data } of entries) Object.assign(ref, data);
  }
}

export function makeFakePrismaService(): PrismaService & FakePrismaStores {
  const product = new FakeProductStore();
  const productVariant = new FakeVariantStore(product);
  // cart ↔ cartItem know about each other; the holder breaks the cycle.
  const holder: { cart?: FakeCartStore } = {};
  const cartItem = new FakeCartItemStore(productVariant, () => holder.cart!);
  const cartStore = new FakeCartStore(cartItem);
  holder.cart = cartStore;
  const promoCode = new FakePromoStore();
  const delivery = new FakeDeliveryStore();
  // order ↔ orderItem ↔ delivery ↔ warmingJob cross-reference; holders break the cycles.
  const orderHolder: { order?: FakeOrderStore } = {};
  const warmingHolder: { warmingJob?: FakeWarmingJobStore } = {};
  const orderItem = new FakeOrderItemStore(
    () => orderHolder.order!,
    () => delivery,
    () => warmingHolder.warmingJob,
  );
  const userStore = new FakeUserStore(() => orderHolder.order);
  const order = new FakeOrderStore(
    orderItem,
    promoCode,
    () => warmingHolder.warmingJob!,
    () => userStore,
  );
  orderHolder.order = order;
  const warmingTask = new FakeWarmingTaskStore();
  const accountAsset = new FakeAccountAssetStore();
  const bundle = new FakeBundleStore();
  const warmingJob = new FakeWarmingJobStore(
    () => warmingTask,
    () => orderItem,
    () => order,
    () => productVariant,
    () => accountAsset,
    () => bundle,
  );
  warmingHolder.warmingJob = warmingJob;
  const stores: FakePrismaStores = {
    user: userStore,
    category: new FakeCategoryStore(),
    product,
    productVariant,
    cart: cartStore,
    cartItem,
    order,
    orderItem,
    promoCode,
    ledgerEntry: new FakeLedgerStore(),
    topUp: new FakeTopUpStore(),
    idempotencyKey: new FakeIdempotencyStore(),
    stockItem: new FakeStockItemStore(),
    delivery,
    auditLog: new FakeAuditStore(),
    warmingPlan: new FakeWarmingPlanStore(),
    warmingJob,
    warmingTask,
    accountAsset,
    bundle,
    bundleComponent: new FakeBundleComponentStore(),
    proxyItem: new FakeProxyItemStore(),
    octoProfile: new FakeOctoProfileStore(),
  };
  return {
    ...stores,
    // Single-writer in-memory stores: an interactive transaction runs the
    // callback over the same stores; a throw restores the pre-tx snapshot,
    // mirroring the rollback the checkout/debit logic relies on.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = takeSnapshot(stores);
      try {
        return await fn(stores);
      } catch (error) {
        restoreSnapshot(snapshot);
        throw error;
      }
    },
    isHealthy: async () => true,
    onModuleDestroy: async () => undefined,
  } as unknown as PrismaService & FakePrismaStores;
}

export const TEST_ENV: Partial<Env> = {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 3600,
  WEB_URL: 'http://localhost:5173',
  PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret-0123456789ab',
  TOPUP_TTL_MINUTES: 15,
  // Decodes to 32 bytes; the crypto tests use their own rings.
  PAYLOAD_ENCRYPTION_KEY: 'v1:dGVzdC1wYXlsb2FkLWtleS0zMi1ieXRlcy1sb25nMDA=',
  STOCK_RESERVE_TTL_SECONDS: 300,
  WARMING_HOLD_BUFFER_MINUTES: 720,
  WARMING_DEFAULT_STAGE_MINUTES: 1_440,
};

export function makeFakeConfigService(overrides: Partial<Env> = {}): ConfigService<Env, true> {
  const env = { ...TEST_ENV, ...overrides };
  return {
    get: (key: keyof Env) => env[key],
  } as unknown as ConfigService<Env, true>;
}
