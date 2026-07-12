import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
  Category as DbCategory,
  CategoryTranslation,
  Product as DbProduct,
  ProductTranslation,
  ProductVariant as DbVariant,
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

  async update({ where, data }: { where: { id: string }; data: Partial<DbUser> }): Promise<DbUser> {
    const row = await this.findUnique({ where });
    if (!row) throw new Error('Record not found');
    Object.assign(row, data, { updatedAt: new Date() });
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

export interface FakePrismaStores {
  user: FakeUserStore;
  category: FakeCategoryStore;
  product: FakeProductStore;
}

export function makeFakePrismaService(): PrismaService & FakePrismaStores {
  return {
    user: new FakeUserStore(),
    category: new FakeCategoryStore(),
    product: new FakeProductStore(),
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
};

export function makeFakeConfigService(overrides: Partial<Env> = {}): ConfigService<Env, true> {
  const env = { ...TEST_ENV, ...overrides };
  return {
    get: (key: keyof Env) => env[key],
  } as unknown as ConfigService<Env, true>;
}
