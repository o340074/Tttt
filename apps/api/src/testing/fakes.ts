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
  Notification as DbNotification,
  OctoProfile as DbOctoProfile,
  Order as DbOrder,
  OrderItem as DbOrderItem,
  Product as DbProduct,
  ProxyItem as DbProxyItem,
  ProductTranslation,
  ProductVariant as DbVariant,
  PromoCode as DbPromoCode,
  Referral as DbReferral,
  ReferralCode as DbReferralCode,
  Setting as DbSetting,
  StockItem as DbStockItem,
  Ticket as DbTicket,
  TicketMessage as DbTicketMessage,
  TopUp as DbTopUp,
  User as DbUser,
  WarmingJob as DbWarmingJob,
  WarmingPlan as DbWarmingPlan,
  WarmingStageTemplate as DbWarmingStageTemplate,
  WarmingTask as DbWarmingTask,
  WarrantyClaim as DbWarrantyClaim,
} from '@prisma/client';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../wallet/ledger.service';
import { ReferralsService } from '../referrals/referrals.service';
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
      role?: DbUser['role'] | { in: DbUser['role'][] };
      email?: { contains: string; mode?: string };
    },
  ): boolean {
    if (!where) return true;
    if (where.status !== undefined && row.status !== where.status) return false;
    if (where.role !== undefined) {
      if (typeof where.role === 'object') {
        if (!where.role.in.includes(row.role)) return false;
      } else if (row.role !== where.role) return false;
    }
    if (where.email && !row.email.toLowerCase().includes(where.email.contains.toLowerCase())) {
      return false;
    }
    return true;
  }

  findMany(args: {
    where?: {
      status?: DbUser['status'];
      role?: DbUser['role'] | { in: DbUser['role'][] };
      email?: { contains: string };
    };
    orderBy?: { createdAt: 'asc' | 'desc' } | { role?: 'asc' | 'desc'; email?: 'asc' | 'desc' }[];
    skip?: number;
    take?: number;
    include?: { _count?: unknown };
    select?: unknown;
  }): Promise<(DbUser & { _count?: { orders: number } })[]> {
    let rows = this.rows.filter((r) => this.matches(r, args.where));
    if (Array.isArray(args.orderBy)) {
      // Staff list: order by role, then email.
      rows = [...rows].sort(
        (a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email),
      );
    } else if (args.orderBy?.createdAt === 'desc') {
      rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    const skip = args.skip ?? 0;
    rows = rows.slice(skip, args.take !== undefined ? skip + args.take : undefined);
    return Promise.resolve(rows.map((r) => this.decorate(r, args.include)));
  }

  count({
    where,
  }: {
    where?: { status?: DbUser['status']; role?: DbUser['role']; email?: { contains: string } };
  } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => this.matches(r, where)).length);
  }

  aggregate(args: {
    _sum: { balance: true };
  }): Promise<{ _sum: { balance: Prisma.Decimal | null } }> {
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

  findUnique({ where }: { where: { id: string } }): Promise<FakeCategoryRow | null> {
    return Promise.resolve(this.rows.find((r) => r.id === where.id) ?? null);
  }

  create({
    data,
  }: {
    data: { slug: string; parentId?: string | null; position?: number };
  }): Promise<FakeCategoryRow> {
    if (this.rows.some((r) => r.slug === data.slug)) throw uniqueViolation('Category.slug');
    const row: FakeCategoryRow = {
      id: randomUUID(),
      slug: data.slug,
      parentId: data.parentId ?? null,
      position: data.position ?? 0,
      translations: [],
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  update({
    where,
    data,
  }: {
    where: { id: string };
    data: { slug?: string; parentId?: string | null; position?: number };
  }): Promise<FakeCategoryRow> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    if (
      data.slug !== undefined &&
      data.slug !== row.slug &&
      this.rows.some((r) => r.slug === data.slug)
    ) {
      throw uniqueViolation('Category.slug');
    }
    Object.assign(row, data);
    return Promise.resolve(row);
  }
}

export class FakeCategoryTranslationStore {
  readonly rows: CategoryTranslation[] = [];

  findMany({ where }: { where: { categoryId: string } }): Promise<CategoryTranslation[]> {
    return Promise.resolve(this.rows.filter((r) => r.categoryId === where.categoryId));
  }

  create({
    data,
  }: {
    data: { categoryId: string; locale: string; name: string };
  }): Promise<CategoryTranslation> {
    const row: CategoryTranslation = { id: randomUUID(), ...data };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  deleteMany({ where }: { where: { categoryId: string } }): Promise<{ count: number }> {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      if (this.rows[i]!.categoryId === where.categoryId) this.rows.splice(i, 1);
    }
    return Promise.resolve({ count: before - this.rows.length });
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

  findUnique({ where }: { where: { id: string } }): Promise<FakeProductRow | null> {
    return Promise.resolve(this.rows.find((r) => r.id === where.id) ?? null);
  }

  count({ where }: { where?: { categoryId?: string; status?: string } }): Promise<number> {
    const w = where ?? {};
    return Promise.resolve(
      this.rows.filter(
        (r) =>
          (w.categoryId === undefined || r.categoryId === w.categoryId) &&
          (w.status === undefined || r.status === w.status),
      ).length,
    );
  }

  create({
    data,
  }: {
    data: {
      categoryId: string;
      slug: string;
      status?: DbProduct['status'];
      attributes?: Prisma.JsonValue;
    };
  }): Promise<FakeProductRow> {
    if (this.rows.some((r) => r.slug === data.slug)) throw uniqueViolation('Product.slug');
    const now = new Date();
    const row: FakeProductRow = {
      id: randomUUID(),
      categoryId: data.categoryId,
      slug: data.slug,
      status: data.status ?? 'draft',
      ratingAvg: null,
      attributes: (data.attributes ?? {}) as FakeProductRow['attributes'],
      createdAt: now,
      updatedAt: now,
      translations: [],
      variants: [],
      // Storefront-only stub; admin resolves the category via the category store.
      category: {
        id: data.categoryId,
        parentId: null,
        slug: '',
        position: 0,
      } as DbCategory,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  update({
    where,
    data,
  }: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<FakeProductRow> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    if (
      typeof data.slug === 'string' &&
      data.slug !== row.slug &&
      this.rows.some((r) => r.slug === data.slug)
    ) {
      throw uniqueViolation('Product.slug');
    }
    Object.assign(row, data, { updatedAt: new Date() });
    return Promise.resolve(row);
  }
}

export class FakeProductTranslationStore {
  readonly rows: ProductTranslation[] = [];

  findMany({ where }: { where: { productId: string } }): Promise<ProductTranslation[]> {
    return Promise.resolve(this.rows.filter((r) => r.productId === where.productId));
  }

  create({
    data,
  }: {
    data: { productId: string; locale: string; name: string; description?: string | null };
  }): Promise<ProductTranslation> {
    const row: ProductTranslation = {
      id: randomUUID(),
      productId: data.productId,
      locale: data.locale,
      name: data.name,
      description: data.description ?? null,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  deleteMany({ where }: { where: { productId: string } }): Promise<{ count: number }> {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      if (this.rows[i]!.productId === where.productId) this.rows.splice(i, 1);
    }
    return Promise.resolve({ count: before - this.rows.length });
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
  groupBy(args: { by: ['direction', 'refType']; _sum: { amount: true } }): Promise<
    {
      direction: DbLedgerEntry['direction'];
      refType: DbLedgerEntry['refType'];
      _sum: { amount: Prisma.Decimal | null };
    }[]
  > {
    void args;
    const groups = new Map<
      string,
      {
        direction: DbLedgerEntry['direction'];
        refType: DbLedgerEntry['refType'];
        sum: Prisma.Decimal;
      }
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

  /** Admin catalog: variants of a product / of a plan. */
  findMany({
    where,
  }: {
    where?: { productId?: string; warmingPlanId?: string };
  }): Promise<DbVariant[]> {
    const w = where ?? {};
    return Promise.resolve(
      this.rows.filter(
        (r) =>
          (w.productId === undefined || r.productId === w.productId) &&
          (w.warmingPlanId === undefined || r.warmingPlanId === w.warmingPlanId),
      ),
    );
  }

  count({ where }: { where?: { warmingPlanId?: string; productId?: string } }): Promise<number> {
    const w = where ?? {};
    return Promise.resolve(
      this.rows.filter(
        (r) =>
          (w.warmingPlanId === undefined || r.warmingPlanId === w.warmingPlanId) &&
          (w.productId === undefined || r.productId === w.productId),
      ).length,
    );
  }

  create({ data }: { data: Record<string, unknown> }): Promise<DbVariant> {
    if (this.rows.some((r) => r.sku === data.sku)) throw uniqueViolation('ProductVariant.sku');
    const now = new Date();
    const fulfillmentType = (data.fulfillmentType ?? 'READY_STOCK') as DbVariant['fulfillmentType'];
    const row: DbVariant = {
      id: randomUUID(),
      productId: data.productId as string,
      sku: data.sku as string,
      price:
        data.price instanceof Prisma.Decimal
          ? data.price
          : new Prisma.Decimal(String(data.price ?? '0')),
      currency: (data.currency as string) ?? 'USD',
      fulfillmentType,
      deliveryType: (data.deliveryType ??
        (fulfillmentType === 'READY_STOCK' ? 'auto' : 'manual')) as DbVariant['deliveryType'],
      stockCount: (data.stockCount as number) ?? 0,
      isActive: (data.isActive as boolean) ?? true,
      attributes: (data.attributes ?? {}) as DbVariant['attributes'],
      goal: (data.goal as string | null) ?? null,
      tier: (data.tier as string | null) ?? null,
      warmingPlanId: (data.warmingPlanId as string | null) ?? null,
      bundleSpec: (data.bundleSpec ?? []) as DbVariant['bundleSpec'],
      etaMinutes: (data.etaMinutes as number | null) ?? null,
      warrantyHours: (data.warrantyHours as number | null) ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  /**
   * Checkout guard (id + isActive + stockCount>=qty, decrement) AND the plan
   * ETA recompute (warmingPlanId + fulfillmentType, set etaMinutes).
   */
  updateMany({
    where,
    data,
  }: {
    where: {
      id?: string;
      isActive?: boolean;
      stockCount?: { gte: number };
      warmingPlanId?: string;
      fulfillmentType?: DbVariant['fulfillmentType'];
    };
    data: { stockCount?: { decrement: number }; updatedAt?: Date; etaMinutes?: number | null };
  }): Promise<{ count: number }> {
    const matched = this.rows.filter(
      (r) =>
        (where.id === undefined || r.id === where.id) &&
        (where.isActive === undefined || r.isActive === where.isActive) &&
        (where.stockCount === undefined || r.stockCount >= where.stockCount.gte) &&
        (where.warmingPlanId === undefined || r.warmingPlanId === where.warmingPlanId) &&
        (where.fulfillmentType === undefined || r.fulfillmentType === where.fulfillmentType),
    );
    for (const row of matched) {
      if (data.stockCount) row.stockCount -= data.stockCount.decrement;
      if (data.etaMinutes !== undefined) row.etaMinutes = data.etaMinutes;
      if (data.updatedAt) row.updatedAt = data.updatedAt;
    }
    return Promise.resolve({ count: matched.length });
  }

  /** Stock cache recompute + admin variant edits (arbitrary scalar fields). */
  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<DbVariant> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    if (
      typeof data.sku === 'string' &&
      data.sku !== row.sku &&
      this.rows.some((r) => r.sku === data.sku)
    ) {
      throw uniqueViolation('ProductVariant.sku');
    }
    Object.assign(row, data, { updatedAt: new Date() });
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
  variant?: { warrantyHours: number | null };
  deliveries?: DbDelivery[];
  warrantyClaims?: {
    id: string;
    number: string;
    type: DbWarrantyClaim['type'];
    status: DbWarrantyClaim['status'];
  }[];
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
    private readonly variants: () => FakeVariantStore | undefined = () => undefined,
    private readonly deliveries: () => FakeDeliveryStore | undefined = () => undefined,
    private readonly claims: () => FakeWarrantyClaimStore | undefined = () => undefined,
  ) {}

  private withRels(row: DbOrder): FakeOrderWithRels {
    const buyer = this.users().rows.find((u) => u.id === row.userId) ?? null;
    return {
      user: buyer ? { id: buyer.id, email: buyer.email } : null,
      ...row,
      items: this.items.rows
        .filter((i) => i.orderId === row.id)
        .map((i) => ({
          ...i,
          warmingJob: this.warming().forOrderItem(i.id),
          // E10: warranty window + claims so the buyer order view can offer
          // replace/refund. Stores are optional so legacy fixtures still build.
          variant: {
            warrantyHours:
              this.variants()?.rows.find((v) => v.id === i.variantId)?.warrantyHours ?? null,
          },
          deliveries: this.deliveries()?.forOrderItem(i.id) ?? [],
          warrantyClaims: (this.claims()?.rows ?? [])
            .filter((c) => c.orderItemId === i.id)
            .map((c) => ({ id: c.id, number: c.number, type: c.type, status: c.status })),
        })),
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

  /** Reports dashboard: SUM(total) + COUNT over status-in filtered orders. */
  aggregate(args: {
    where?: { status?: { in: DbOrder['status'][] } };
    _sum?: { total: true };
    _count?: { _all: true };
  }): Promise<{ _sum: { total: Prisma.Decimal | null }; _count: { _all: number } }> {
    const statusIn = args.where?.status?.in;
    const rows = this.rows.filter((r) => !statusIn || statusIn.includes(r.status));
    const sum = rows.reduce((acc, r) => acc.plus(r.total), new Prisma.Decimal(0));
    return Promise.resolve({
      _sum: { total: rows.length ? sum : null },
      _count: { _all: rows.length },
    });
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
    private readonly variants: () => FakeVariantStore | undefined = () => undefined,
    private readonly claims: () => FakeWarrantyClaimStore | undefined = () => undefined,
  ) {}

  /**
   * Item by id scoped to its order's owner. Supports the delivery/warming
   * includes (getDelivery, E5) and the warranty includes (E10): order snapshot,
   * variant warranty window, deliveries and existing claims.
   */
  findFirst({
    where,
    include,
  }: {
    where: { id: string; orderId?: string; order?: { userId: string } };
    include?: {
      deliveries?: unknown;
      warmingJob?: unknown;
      variant?: unknown;
      warrantyClaims?: unknown;
      order?: unknown;
    };
  }): Promise<FakeOrderItemWithDeliveries | DbOrderItem | null> {
    const row = this.rows.find(
      (r) => r.id === where.id && (where.orderId === undefined || r.orderId === where.orderId),
    );
    if (!row) return Promise.resolve(null);
    if (where.order?.userId !== undefined) {
      const order = this.orders().rows.find((o) => o.id === row.orderId);
      if (!order || order.userId !== where.order.userId) return Promise.resolve(null);
    }
    if (!include) return Promise.resolve(row);
    const decorated: Record<string, unknown> = { ...row };
    if (include.deliveries) decorated.deliveries = this.deliveries().forOrderItem(row.id);
    if (include.warmingJob) decorated.warmingJob = this.warming()?.forOrderItem(row.id) ?? null;
    if (include.variant) {
      const v = this.variants()?.rows.find((x) => x.id === row.variantId);
      decorated.variant = { warrantyHours: v?.warrantyHours ?? null };
    }
    if (include.warrantyClaims) {
      decorated.warrantyClaims = (this.claims()?.rows ?? [])
        .filter((c) => c.orderItemId === row.id)
        .map((c) => ({ id: c.id, number: c.number, type: c.type, status: c.status }));
    }
    if (include.order) {
      const order = this.orders().rows.find((o) => o.id === row.orderId) ?? null;
      decorated.order = order ? { id: order.id, number: order.number } : null;
    }
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

// ---------- Warranty claim fake (E10) ----------

interface ClaimWhere {
  id?: string;
  status?: DbWarrantyClaim['status'];
  requesterId?: string;
}

/**
 * Warranty claims (E10). Decorate mirrors the admin/client includes: the
 * claimed order item (with its order snapshot, variant fulfillment/warranty and
 * warming job) plus the requester's email — enough for both surfaces.
 */
export class FakeWarrantyClaimStore {
  readonly rows: DbWarrantyClaim[] = [];

  constructor(
    private readonly orderItems: () => FakeOrderItemStore,
    private readonly orders: () => FakeOrderStore,
    private readonly variants: () => FakeVariantStore,
    private readonly users: () => FakeUserStore,
    private readonly warming: () => FakeWarmingJobStore,
  ) {}

  private decorate(row: DbWarrantyClaim): Record<string, unknown> {
    const item = this.orderItems().rows.find((i) => i.id === row.orderItemId);
    const order = item ? this.orders().rows.find((o) => o.id === item.orderId) : undefined;
    const variant = item ? this.variants().rows.find((v) => v.id === item.variantId) : undefined;
    const job = item ? this.warming().forOrderItem(item.id) : null;
    const requester = this.users().rows.find((u) => u.id === row.requesterId);
    return {
      ...row,
      orderItem: item
        ? {
            id: item.id,
            sku: item.sku,
            nameSnapshot: item.nameSnapshot,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            deliveryType: item.deliveryType,
            deliveryStatus: item.deliveryStatus,
            variantId: item.variantId,
            variant: { fulfillmentType: variant?.fulfillmentType ?? 'READY_STOCK' },
            order: order
              ? {
                  id: order.id,
                  number: order.number,
                  currency: order.currency,
                  userId: order.userId,
                  discount: order.discount,
                  items: this.orderItems()
                    .rows.filter((i) => i.orderId === order.id)
                    .map((i) => ({ id: i.id, unitPrice: i.unitPrice, quantity: i.quantity })),
                }
              : null,
            warmingJob: job ? { id: job.id, status: job.status } : null,
          }
        : null,
      requester: { email: requester?.email ?? '' },
    };
  }

  private match(row: DbWarrantyClaim, where: ClaimWhere = {}): boolean {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.status !== undefined && row.status !== where.status) return false;
    if (where.requesterId !== undefined && row.requesterId !== where.requesterId) return false;
    return true;
  }

  create({
    data,
  }: {
    data: Omit<DbWarrantyClaim, 'createdAt' | 'updatedAt'> & { id?: string };
  }): Promise<DbWarrantyClaim> {
    if (this.rows.some((r) => r.number === data.number)) {
      return Promise.reject(uniqueViolation('warranty_claims_number_key'));
    }
    const now = new Date();
    const row: DbWarrantyClaim = {
      id: data.id ?? randomUUID(),
      number: data.number,
      orderItemId: data.orderItemId,
      deliveryId: data.deliveryId ?? null,
      requesterId: data.requesterId,
      type: data.type,
      status: data.status ?? 'requested',
      reason: data.reason,
      resolutionNote: data.resolutionNote ?? null,
      resolvedById: data.resolvedById ?? null,
      replacementDeliveryId: data.replacementDeliveryId ?? null,
      warrantyExpiresAt: data.warrantyExpiresAt,
      createdAt: now,
      updatedAt: now,
      resolvedAt: data.resolvedAt ?? null,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findUnique({ where }: { where: { id: string }; include?: unknown }): Promise<unknown> {
    const row = this.rows.find((r) => r.id === where.id);
    return Promise.resolve(row ? this.decorate(row) : null);
  }

  findFirst({ where }: { where: ClaimWhere; include?: unknown }): Promise<unknown> {
    const row = this.rows.find((r) => this.match(r, where));
    return Promise.resolve(row ? this.decorate(row) : null);
  }

  findMany(args: {
    where?: ClaimWhere;
    include?: unknown;
    orderBy?: { createdAt: 'asc' | 'desc' };
    skip?: number;
    take?: number;
  }): Promise<unknown[]> {
    let rows = this.rows.filter((r) => this.match(r, args.where));
    rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (args.orderBy?.createdAt === 'desc') rows.reverse();
    const skip = args.skip ?? 0;
    if (args.take !== undefined) rows = rows.slice(skip, skip + args.take);
    else if (skip) rows = rows.slice(skip);
    return Promise.resolve(rows.map((r) => this.decorate(r)));
  }

  count({ where }: { where?: ClaimWhere } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => this.match(r, where)).length);
  }

  update({
    where,
    data,
  }: {
    where: { id: string };
    data: Partial<DbWarrantyClaim>;
  }): Promise<DbWarrantyClaim> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) return Promise.reject(new Error('Record not found'));
    Object.assign(row, data, { updatedAt: new Date() });
    return Promise.resolve(row);
  }

  updateMany({
    where,
    data,
  }: {
    where: ClaimWhere;
    data: Partial<DbWarrantyClaim>;
  }): Promise<{ count: number }> {
    const rows = this.rows.filter((r) => this.match(r, where));
    for (const row of rows) Object.assign(row, data, { updatedAt: new Date() });
    return Promise.resolve({ count: rows.length });
  }
}

// ---------- Warming fakes (E6) ----------

type PlanWithStages = DbWarmingPlan & { stages: DbWarmingStageTemplate[] };

export class FakeWarmingStageStore {
  readonly rows: DbWarmingStageTemplate[] = [];

  forPlan(planId: string): DbWarmingStageTemplate[] {
    return this.rows.filter((r) => r.planId === planId).sort((a, b) => a.order - b.order);
  }

  create({
    data,
  }: {
    data: {
      planId: string;
      order: number;
      name: string;
      expectedMinutes: number;
      checklist?: Prisma.JsonValue;
      requiredComponents?: Prisma.JsonValue;
    };
  }): Promise<DbWarmingStageTemplate> {
    const row: DbWarmingStageTemplate = {
      id: randomUUID(),
      planId: data.planId,
      order: data.order,
      name: data.name,
      expectedMinutes: data.expectedMinutes,
      checklist: (data.checklist ?? []) as DbWarmingStageTemplate['checklist'],
      requiredComponents: (data.requiredComponents ??
        []) as DbWarmingStageTemplate['requiredComponents'],
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  deleteMany({ where }: { where: { planId: string } }): Promise<{ count: number }> {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      if (this.rows[i]!.planId === where.planId) this.rows.splice(i, 1);
    }
    return Promise.resolve({ count: before - this.rows.length });
  }
}

export class FakeWarmingPlanStore {
  readonly rows: PlanWithStages[] = [];

  constructor(private readonly stages: () => FakeWarmingStageStore) {}

  /** Assemble stages from the stage store, falling back to inline fixtures. */
  private assemble(row: PlanWithStages): PlanWithStages {
    const fromStore = this.stages().forPlan(row.id);
    const stages =
      fromStore.length > 0 ? fromStore : [...row.stages].sort((a, b) => a.order - b.order);
    return { ...row, stages };
  }

  /** createJobForItem / catalog ETA load the plan with its stages ordered. */
  findUnique({
    where,
  }: {
    where: { id: string };
    include?: unknown;
  }): Promise<PlanWithStages | null> {
    const row = this.rows.find((r) => r.id === where.id) ?? null;
    return Promise.resolve(row ? this.assemble(row) : null);
  }

  findMany(_args?: { include?: unknown; orderBy?: unknown }): Promise<PlanWithStages[]> {
    const rows = [...this.rows].sort(
      (a, b) =>
        a.goal.localeCompare(b.goal) ||
        (a.tier ?? '').localeCompare(b.tier ?? '') ||
        b.version - a.version,
    );
    return Promise.resolve(rows.map((r) => this.assemble(r)));
  }

  create({
    data,
  }: {
    data: {
      goal: string;
      tier?: string | null;
      name: string;
      version?: number;
      isActive?: boolean;
      qcRules?: Prisma.JsonValue;
    };
  }): Promise<PlanWithStages> {
    const version = data.version ?? 1;
    if (
      this.rows.some(
        (r) => r.goal === data.goal && r.tier === (data.tier ?? null) && r.version === version,
      )
    ) {
      throw uniqueViolation('WarmingPlan.goal_tier_version');
    }
    const now = new Date();
    const row: PlanWithStages = {
      id: randomUUID(),
      goal: data.goal,
      tier: data.tier ?? null,
      name: data.name,
      version,
      isActive: data.isActive ?? true,
      qcRules: (data.qcRules ?? {}) as PlanWithStages['qcRules'],
      createdAt: now,
      updatedAt: now,
      stages: [],
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  update({
    where,
    data,
  }: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<PlanWithStages> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    const nextGoal = (data.goal as string) ?? row.goal;
    const nextTier = data.tier !== undefined ? (data.tier as string | null) : row.tier;
    const nextVersion = (data.version as number) ?? row.version;
    if (
      this.rows.some(
        (r) => r !== row && r.goal === nextGoal && r.tier === nextTier && r.version === nextVersion,
      )
    ) {
      throw uniqueViolation('WarmingPlan.goal_tier_version');
    }
    Object.assign(row, data, { updatedAt: new Date() });
    return Promise.resolve(row);
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

type RichStatus = DbWarmingJob['status'] | { in: DbWarmingJob['status'][] };
interface RichJobWhere {
  status?: RichStatus;
  assignedTo?: string | { not: null };
  etaAt?: { lt: Date };
  deliveredAt?: { gte?: Date; lt?: Date } | Date;
}

/** Reports/staff matcher: supports {in}/{not:null}/{lt} where clauses. */
function matchesRichJob(row: DbWarmingJob, where: RichJobWhere = {}): boolean {
  if (where.status !== undefined) {
    if (typeof where.status === 'object') {
      if (!where.status.in.includes(row.status)) return false;
    } else if (row.status !== where.status) return false;
  }
  if (where.assignedTo !== undefined) {
    if (typeof where.assignedTo === 'object') {
      if (row.assignedTo === null) return false;
    } else if (row.assignedTo !== where.assignedTo) return false;
  }
  if (where.etaAt?.lt && (row.etaAt === null || row.etaAt >= where.etaAt.lt)) return false;
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

  count({ where }: { where?: RichJobWhere } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => matchesRichJob(r, where)).length);
  }

  /** Reports/staff: group counts by status or by assignedTo. */
  groupBy(args: {
    by: ['status'] | ['assignedTo'];
    where?: RichJobWhere;
    _count: { _all: true };
  }): Promise<Record<string, unknown>[]> {
    const field = args.by[0];
    const counts = new Map<string | null, number>();
    for (const row of this.rows.filter((r) => matchesRichJob(r, args.where))) {
      const key = field === 'status' ? row.status : row.assignedTo;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Promise.resolve(
      [...counts.entries()].map(([key, n]) => ({ [field]: key, _count: { _all: n } })),
    );
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

// ---------- Tickets fakes (E8) ----------

interface TicketWhere {
  status?: DbTicket['status'] | { in: DbTicket['status'][] };
  assigneeId?: string | { not: null };
  OR?: { number?: { contains: string }; subject?: { contains: string } }[];
}

function matchesTicket(row: DbTicket, where: TicketWhere = {}): boolean {
  if (where.status) {
    if (typeof where.status === 'object') {
      if (!where.status.in.includes(row.status)) return false;
    } else if (row.status !== where.status) return false;
  }
  if (where.assigneeId !== undefined) {
    if (typeof where.assigneeId === 'object') {
      if (row.assigneeId === null) return false;
    } else if (row.assigneeId !== where.assigneeId) return false;
  }
  if (where.OR) {
    const q = (where.OR[0]?.number?.contains ?? where.OR[1]?.subject?.contains ?? '').toLowerCase();
    const hit = row.number.toLowerCase().includes(q) || row.subject.toLowerCase().includes(q);
    if (!hit) return false;
  }
  return true;
}

export class FakeTicketStore {
  readonly rows: DbTicket[] = [];

  constructor(
    private readonly users: () => FakeUserStore,
    private readonly orders: () => FakeOrderStore,
    private readonly messages: () => FakeTicketMessageStore,
  ) {}

  private decorate(row: DbTicket, include?: { messages?: unknown }): Record<string, unknown> {
    const requester = this.users().rows.find((u) => u.id === row.requesterId);
    const assignee = row.assigneeId ? this.users().rows.find((u) => u.id === row.assigneeId) : null;
    const order = row.orderId ? this.orders().rows.find((o) => o.id === row.orderId) : null;
    const msgs = this.messages().rows.filter((m) => m.ticketId === row.id);
    const decorated: Record<string, unknown> = {
      ...row,
      requester: requester ? { id: requester.id, email: requester.email } : { id: '', email: '' },
      assignee: assignee ? { id: assignee.id, email: assignee.email } : null,
      order: order ? { id: order.id, number: order.number } : null,
      _count: { messages: msgs.length },
    };
    if (include?.messages) {
      decorated.messages = [...msgs]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((m) => {
          const author = m.authorId ? this.users().rows.find((u) => u.id === m.authorId) : null;
          return { ...m, author: author ? { id: author.id, email: author.email } : null };
        });
    }
    return decorated;
  }

  findMany(args: {
    where?: TicketWhere;
    orderBy?: unknown;
    skip?: number;
    take?: number;
    include?: { messages?: unknown };
  }): Promise<Record<string, unknown>[]> {
    let rows = this.rows.filter((r) => matchesTicket(r, args.where));
    rows = [...rows].sort((a, b) => b.lastReplyAt.getTime() - a.lastReplyAt.getTime());
    const skip = args.skip ?? 0;
    rows = rows.slice(skip, args.take !== undefined ? skip + args.take : undefined);
    return Promise.resolve(rows.map((r) => this.decorate(r, args.include)));
  }

  /** Owner-scoped single lookup (buyer portal): where { id, requesterId }. */
  findFirst({
    where,
    include,
  }: {
    where: { id?: string; requesterId?: string; status?: DbTicket['status'] };
    include?: { messages?: unknown };
  }): Promise<Record<string, unknown> | null> {
    const row = this.rows.find(
      (r) =>
        (where.id === undefined || r.id === where.id) &&
        (where.requesterId === undefined || r.requesterId === where.requesterId) &&
        (where.status === undefined || r.status === where.status),
    );
    return Promise.resolve(row ? this.decorate(row, include) : null);
  }

  count({ where }: { where?: TicketWhere } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => matchesTicket(r, where)).length);
  }

  findUnique({
    where,
    include,
  }: {
    where: { id: string };
    include?: { messages?: unknown };
  }): Promise<Record<string, unknown> | null> {
    const row = this.rows.find((r) => r.id === where.id) ?? null;
    return Promise.resolve(row ? this.decorate(row, include) : null);
  }

  create({
    data,
  }: {
    data: {
      number: string;
      subject: string;
      priority?: DbTicket['priority'];
      requesterId: string;
      orderId?: string | null;
      messages?: { create: { authorId?: string | null; body: string; isInternal?: boolean } };
    };
  }): Promise<DbTicket> {
    const now = new Date();
    const row: DbTicket = {
      id: randomUUID(),
      number: data.number,
      subject: data.subject,
      status: 'open',
      priority: data.priority ?? 'normal',
      requesterId: data.requesterId,
      assigneeId: null,
      orderId: data.orderId ?? null,
      lastReplyAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    if (data.messages?.create) {
      void this.messages().create({ data: { ticketId: row.id, ...data.messages.create } });
    }
    return Promise.resolve(row);
  }

  async update({
    where,
    data,
  }: {
    where: { id: string };
    data: Record<string, unknown> & {
      assignee?: { connect?: { id: string }; disconnect?: boolean };
    };
  }): Promise<DbTicket> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('Record not found');
    const { assignee, ...rest } = data;
    Object.assign(row, rest, { updatedAt: new Date() });
    if (assignee?.connect) row.assigneeId = assignee.connect.id;
    if (assignee?.disconnect) row.assigneeId = null;
    return row;
  }

  groupBy(args: {
    by: ['assigneeId'];
    where?: TicketWhere;
  }): Promise<{ assigneeId: string | null; _count: { _all: number } }[]> {
    const counts = new Map<string | null, number>();
    for (const row of this.rows.filter((r) => matchesTicket(r, args.where))) {
      counts.set(row.assigneeId, (counts.get(row.assigneeId) ?? 0) + 1);
    }
    return Promise.resolve(
      [...counts.entries()].map(([assigneeId, n]) => ({ assigneeId, _count: { _all: n } })),
    );
  }
}

export class FakeTicketMessageStore {
  readonly rows: DbTicketMessage[] = [];

  create({
    data,
  }: {
    data: { ticketId: string; authorId?: string | null; body: string; isInternal?: boolean };
  }): Promise<DbTicketMessage> {
    const row: DbTicketMessage = {
      id: randomUUID(),
      ticketId: data.ticketId,
      authorId: data.authorId ?? null,
      body: data.body,
      isInternal: data.isInternal ?? false,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }
}

// ---------- Settings fakes (E8) ----------

export class FakeSettingStore {
  readonly rows: DbSetting[] = [];

  findMany(): Promise<DbSetting[]> {
    return Promise.resolve([...this.rows]);
  }

  upsert({
    where,
    create,
    update,
  }: {
    where: { key: string };
    create: { key: string; value: unknown; updatedBy?: string | null };
    update: { value: unknown; updatedBy?: string | null };
  }): Promise<DbSetting> {
    const existing = this.rows.find((r) => r.key === where.key);
    if (existing) {
      existing.value = update.value as Prisma.JsonValue;
      existing.updatedBy = update.updatedBy ?? null;
      existing.updatedAt = new Date();
      return Promise.resolve(existing);
    }
    const row: DbSetting = {
      key: create.key,
      value: create.value as Prisma.JsonValue,
      updatedBy: create.updatedBy ?? null,
      updatedAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }
}

// ---------- Notifications fakes (E9) ----------

interface NotificationWhere {
  userId?: string;
  id?: string;
  readAt?: null;
}

function matchesNotification(row: DbNotification, where: NotificationWhere = {}): boolean {
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.readAt === null && row.readAt !== null) return false;
  return true;
}

export class FakeNotificationStore {
  readonly rows: DbNotification[] = [];

  create({
    data,
  }: {
    data: {
      userId: string;
      type: DbNotification['type'];
      title: string;
      body: string;
      data?: Prisma.InputJsonValue;
    };
  }): Promise<DbNotification> {
    const row: DbNotification = {
      id: randomUUID(),
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      data: (data.data ?? {}) as Prisma.JsonValue,
      readAt: null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findMany(args: {
    where?: NotificationWhere;
    orderBy?: unknown;
    skip?: number;
    take?: number;
  }): Promise<DbNotification[]> {
    let rows = this.rows.filter((r) => matchesNotification(r, args.where));
    rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const skip = args.skip ?? 0;
    rows = rows.slice(skip, args.take !== undefined ? skip + args.take : undefined);
    return Promise.resolve(rows);
  }

  count({ where }: { where?: NotificationWhere } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => matchesNotification(r, where)).length);
  }

  updateMany({
    where,
    data,
  }: {
    where?: NotificationWhere;
    data: { readAt?: Date };
  }): Promise<{ count: number }> {
    let count = 0;
    for (const row of this.rows.filter((r) => matchesNotification(r, where))) {
      if (data.readAt !== undefined) row.readAt = data.readAt;
      count += 1;
    }
    return Promise.resolve({ count });
  }
}

export class FakeReferralCodeStore {
  readonly rows: DbReferralCode[] = [];

  create({ data }: { data: { userId: string; code: string } }): Promise<DbReferralCode> {
    if (this.rows.some((r) => r.userId === data.userId)) {
      return Promise.reject(uniqueViolation('referral_codes_userId_key'));
    }
    if (this.rows.some((r) => r.code === data.code)) {
      return Promise.reject(uniqueViolation('referral_codes_code_key'));
    }
    const row: DbReferralCode = {
      id: randomUUID(),
      userId: data.userId,
      code: data.code,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findUnique({
    where,
  }: {
    where: { userId?: string; code?: string };
  }): Promise<DbReferralCode | null> {
    const row = this.rows.find(
      (r) =>
        (where.userId === undefined || r.userId === where.userId) &&
        (where.code === undefined || r.code === where.code),
    );
    return Promise.resolve(row ?? null);
  }
}

interface ReferralWhere {
  referrerId?: string;
  refereeId?: string;
  status?: DbReferral['status'];
  qualifyingOrderId?: string;
  id?: string;
}

function matchesReferral(row: DbReferral, where: ReferralWhere = {}): boolean {
  return (
    (where.id === undefined || row.id === where.id) &&
    (where.referrerId === undefined || row.referrerId === where.referrerId) &&
    (where.refereeId === undefined || row.refereeId === where.refereeId) &&
    (where.status === undefined || row.status === where.status) &&
    (where.qualifyingOrderId === undefined || row.qualifyingOrderId === where.qualifyingOrderId)
  );
}

export class FakeReferralStore {
  readonly rows: DbReferral[] = [];

  constructor(
    private readonly users: () => FakeUserStore,
    private readonly codes: () => FakeReferralCodeStore,
  ) {}

  create({
    data,
  }: {
    data: { referrerId: string; refereeId: string; codeId: string };
  }): Promise<DbReferral> {
    if (this.rows.some((r) => r.refereeId === data.refereeId)) {
      return Promise.reject(uniqueViolation('referrals_refereeId_key'));
    }
    const row: DbReferral = {
      id: randomUUID(),
      referrerId: data.referrerId,
      refereeId: data.refereeId,
      codeId: data.codeId,
      status: 'pending',
      referrerReward: new Prisma.Decimal(0),
      refereeReward: new Prisma.Decimal(0),
      qualifyingOrderId: null,
      qualifiedAt: null,
      cancelledReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findUnique({ where }: { where: ReferralWhere }): Promise<DbReferral | null> {
    return Promise.resolve(this.rows.find((r) => matchesReferral(r, where)) ?? null);
  }

  findFirst({ where }: { where?: ReferralWhere } = {}): Promise<DbReferral | null> {
    return Promise.resolve(this.rows.find((r) => matchesReferral(r, where)) ?? null);
  }

  findMany(args: {
    where?: ReferralWhere;
    include?: unknown;
    orderBy?: unknown;
    skip?: number;
    take?: number;
  }): Promise<unknown[]> {
    let rows = this.rows.filter((r) => matchesReferral(r, args.where));
    rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const skip = args.skip ?? 0;
    rows = rows.slice(skip, args.take !== undefined ? skip + args.take : undefined);
    return Promise.resolve(rows.map((r) => this.withInclude(r, args.include)));
  }

  count({ where }: { where?: ReferralWhere } = {}): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => matchesReferral(r, where)).length);
  }

  updateMany({
    where,
    data,
  }: {
    where?: ReferralWhere;
    data: Partial<DbReferral>;
  }): Promise<{ count: number }> {
    let count = 0;
    for (const row of this.rows.filter((r) => matchesReferral(r, where))) {
      Object.assign(row, data, { updatedAt: new Date() });
      count += 1;
    }
    return Promise.resolve({ count });
  }

  update({
    where,
    data,
    include,
  }: {
    where: { id: string };
    data: Partial<DbReferral>;
    include?: unknown;
  }): Promise<unknown> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) return Promise.reject(new Error('Referral not found'));
    Object.assign(row, data, { updatedAt: new Date() });
    return Promise.resolve(this.withInclude(row, include));
  }

  groupBy(_args: {
    by: ['status'];
    _count: { _all: true };
  }): Promise<{ status: DbReferral['status']; _count: { _all: number } }[]> {
    const counts = new Map<DbReferral['status'], number>();
    for (const r of this.rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return Promise.resolve(
      [...counts.entries()].map(([status, n]) => ({ status, _count: { _all: n } })),
    );
  }

  aggregate(args: {
    where?: ReferralWhere;
    _sum: { referrerReward?: true; refereeReward?: true };
  }): Promise<{ _sum: { referrerReward: Prisma.Decimal | null; refereeReward: Prisma.Decimal | null } }> {
    const rows = this.rows.filter((r) => matchesReferral(r, args.where));
    const sum = (pick: (r: DbReferral) => Prisma.Decimal): Prisma.Decimal | null =>
      rows.length === 0 ? null : rows.reduce((acc, r) => acc.plus(pick(r)), new Prisma.Decimal(0));
    return Promise.resolve({
      _sum: {
        referrerReward: sum((r) => r.referrerReward),
        refereeReward: sum((r) => r.refereeReward),
      },
    });
  }

  private withInclude(row: DbReferral, include: unknown): unknown {
    if (!include || typeof include !== 'object') return row;
    const inc = include as Record<string, unknown>;
    const out: Record<string, unknown> = { ...row };
    if (inc.referee) {
      const u = this.users().rows.find((x) => x.id === row.refereeId);
      out.referee = { email: u?.email ?? '' };
    }
    if (inc.referrer) {
      const u = this.users().rows.find((x) => x.id === row.referrerId);
      out.referrer = { email: u?.email ?? '' };
    }
    if (inc.code) {
      const c = this.codes().rows.find((x) => x.id === row.codeId);
      out.code = { code: c?.code ?? '' };
    }
    return out;
  }
}

export interface FakePrismaStores {
  user: FakeUserStore;
  category: FakeCategoryStore;
  categoryTranslation: FakeCategoryTranslationStore;
  product: FakeProductStore;
  productTranslation: FakeProductTranslationStore;
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
  warmingStageTemplate: FakeWarmingStageStore;
  warmingJob: FakeWarmingJobStore;
  warmingTask: FakeWarmingTaskStore;
  accountAsset: FakeAccountAssetStore;
  bundle: FakeBundleStore;
  bundleComponent: FakeBundleComponentStore;
  proxyItem: FakeProxyItemStore;
  octoProfile: FakeOctoProfileStore;
  ticket: FakeTicketStore;
  ticketMessage: FakeTicketMessageStore;
  setting: FakeSettingStore;
  notification: FakeNotificationStore;
  warrantyClaim: FakeWarrantyClaimStore;
  referralCode: FakeReferralCodeStore;
  referral: FakeReferralStore;
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
  const claimHolder: { warrantyClaim?: FakeWarrantyClaimStore } = {};
  const orderItem = new FakeOrderItemStore(
    () => orderHolder.order!,
    () => delivery,
    () => warmingHolder.warmingJob,
    () => productVariant,
    () => claimHolder.warrantyClaim,
  );
  const userStore = new FakeUserStore(() => orderHolder.order);
  const order = new FakeOrderStore(
    orderItem,
    promoCode,
    () => warmingHolder.warmingJob!,
    () => userStore,
    () => productVariant,
    () => delivery,
    () => claimHolder.warrantyClaim,
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
  const warrantyClaim = new FakeWarrantyClaimStore(
    () => orderItem,
    () => order,
    () => productVariant,
    () => userStore,
    () => warmingJob,
  );
  claimHolder.warrantyClaim = warrantyClaim;
  const warmingStageTemplate = new FakeWarmingStageStore();
  const ticketMessage = new FakeTicketMessageStore();
  const ticket = new FakeTicketStore(
    () => userStore,
    () => order,
    () => ticketMessage,
  );
  const referralCode = new FakeReferralCodeStore();
  const referral = new FakeReferralStore(
    () => userStore,
    () => referralCode,
  );
  const stores: FakePrismaStores = {
    user: userStore,
    category: new FakeCategoryStore(),
    categoryTranslation: new FakeCategoryTranslationStore(),
    product,
    productTranslation: new FakeProductTranslationStore(),
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
    warmingPlan: new FakeWarmingPlanStore(() => warmingStageTemplate),
    warmingStageTemplate,
    warmingJob,
    warmingTask,
    accountAsset,
    bundle,
    bundleComponent: new FakeBundleComponentStore(),
    proxyItem: new FakeProxyItemStore(),
    octoProfile: new FakeOctoProfileStore(),
    ticket,
    ticketMessage,
    setting: new FakeSettingStore(),
    notification: new FakeNotificationStore(),
    warrantyClaim,
    referralCode,
    referral,
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
  WARRANTY_GRACE_MINUTES: 60,
  SENTRY_DSN: '',
  SENTRY_RELEASE: '',
  REFERRAL_ENABLED: true,
  REFERRAL_REFERRER_REWARD: '5.00',
  REFERRAL_REFEREE_REWARD: '5.00',
  REFERRAL_MIN_PURCHASE: '10.00',
};

export function makeFakeConfigService(overrides: Partial<Env> = {}): ConfigService<Env, true> {
  const env = { ...TEST_ENV, ...overrides };
  return {
    get: (key: keyof Env) => env[key],
  } as unknown as ConfigService<Env, true>;
}

/**
 * A real NotificationsService over the fakes + a stub mailer (E9). Services that
 * emit notifications (orders/warming/admin tickets) take one in their ctor; unit
 * tests wire this so the in-app rows are actually written to the fake store.
 */
export function makeFakeNotificationsService(
  prisma: PrismaService & FakePrismaStores,
): NotificationsService {
  return new NotificationsService(prisma, new MailerService(makeFakeConfigService()));
}

/**
 * A real ReferralsService over the fakes (E12). Orders/warming specs wire this
 * so checkout's qualification hook runs against the fake stores; pass config
 * overrides to tune reward terms.
 */
export function makeFakeReferralsService(
  prisma: PrismaService & FakePrismaStores,
  overrides: Partial<Env> = {},
): ReferralsService {
  const config = makeFakeConfigService(overrides);
  return new ReferralsService(
    prisma,
    new LedgerService(),
    new AuditService(prisma),
    makeFakeNotificationsService(prisma),
    config,
  );
}
