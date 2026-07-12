import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
  Category as DbCategory,
  CategoryTranslation,
  IdempotencyKey as DbIdempotencyKey,
  LedgerEntry as DbLedgerEntry,
  Product as DbProduct,
  ProductTranslation,
  ProductVariant as DbVariant,
  TopUp as DbTopUp,
  User as DbUser,
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

  findUnique({ where }: { where: { id?: string; email?: string } }): Promise<DbUser | null> {
    const row =
      this.rows.find((r) => (where.id ? r.id === where.id : r.email === where.email)) ?? null;
    return Promise.resolve(row);
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
      balance?: Prisma.Decimal | { increment: Prisma.Decimal | string };
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
          : row.balance.plus(new Prisma.Decimal(balance.increment));
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

  count({ where }: { where?: { userId?: string } } = {}): Promise<number> {
    return Promise.resolve(
      this.rows.filter((r) => !where?.userId || r.userId === where.userId).length,
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

export interface FakePrismaStores {
  user: FakeUserStore;
  category: FakeCategoryStore;
  product: FakeProductStore;
  ledgerEntry: FakeLedgerStore;
  topUp: FakeTopUpStore;
  idempotencyKey: FakeIdempotencyStore;
}

export function makeFakePrismaService(): PrismaService & FakePrismaStores {
  const stores = {
    user: new FakeUserStore(),
    category: new FakeCategoryStore(),
    product: new FakeProductStore(),
    ledgerEntry: new FakeLedgerStore(),
    topUp: new FakeTopUpStore(),
    idempotencyKey: new FakeIdempotencyStore(),
  };
  return {
    ...stores,
    // Single-writer in-memory stores: an interactive transaction is just the
    // callback over the same stores (no rollback simulation).
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(stores),
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
};

export function makeFakeConfigService(overrides: Partial<Env> = {}): ConfigService<Env, true> {
  const env = { ...TEST_ENV, ...overrides };
  return {
    get: (key: keyof Env) => env[key],
  } as unknown as ConfigService<Env, true>;
}
