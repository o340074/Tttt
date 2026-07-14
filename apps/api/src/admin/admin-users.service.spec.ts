import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../wallet/ledger.service';
import { makeFakePrismaService } from '../testing/fakes';
import { AdminUsersService } from './admin-users.service';
import type { TokenService } from '../auth/token.service';
import type { Role, UserStatus } from '@advault/types';

/**
 * AdminUsersService over the in-memory fakes: listing/filtering, the user card
 * with order counts + ledger reconciliation, blocking (revokes sessions) and
 * role changes — with the self-action and no-op guards.
 */
describe('AdminUsersService (E8 users)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let users: AdminUsersService;
  let revokeAllSessions: ReturnType<typeof vi.fn>;
  let adminId: string;

  const seedUser = (over: Partial<{ role: Role; status: UserStatus; balance: string; email: string }> = {}): string => {
    const id = randomUUID();
    prisma.user.rows.push({
      id,
      email: over.email ?? `u-${id}@example.com`,
      passwordHash: 'x',
      role: (over.role ?? 'user') as Role,
      status: (over.status ?? 'active') as UserStatus,
      balance: new Prisma.Decimal(over.balance ?? '0.00'),
      locale: 'en',
      emailVerifiedAt: null,
      twoFactorSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  };

  beforeEach(() => {
    prisma = makeFakePrismaService();
    revokeAllSessions = vi.fn().mockResolvedValue(undefined);
    const tokens = { revokeAllSessions } as unknown as TokenService;
    users = new AdminUsersService(prisma, tokens, new AuditService(prisma), new LedgerService());
    adminId = seedUser({ role: 'admin', email: 'admin@example.com' });
  });

  it('lists with an email filter and paginates', async () => {
    seedUser({ email: 'alice@shop.com' });
    seedUser({ email: 'bob@shop.com' });
    const page = await users.list({ q: 'alice' }, 1, 20);
    expect(page.meta.total).toBe(1);
    expect(page.data[0]!.email).toBe('alice@shop.com');
  });

  it('returns a user card with order count and ledger reconciliation', async () => {
    const buyer = seedUser({ balance: '40.00' });
    prisma.order.rows.push({
      id: randomUUID(),
      userId: buyer,
      number: 'AV-1',
      status: 'paid',
      subtotal: new Prisma.Decimal('40'),
      discount: new Prisma.Decimal('0'),
      total: new Prisma.Decimal('40'),
      currency: 'USD',
      promoCodeId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await prisma.$transaction((tx) =>
      new LedgerService().credit(tx, {
        userId: buyer,
        amount: '40.00',
        refType: 'topup',
        refId: randomUUID(),
      }),
    );

    const detail = await users.get(buyer);
    expect(detail.orderCount).toBe(1);
    expect(detail.recentOrders).toHaveLength(1);
    expect(detail.ledgerBalance).toBe('40.00');
  });

  it('blocks a user and revokes their sessions', async () => {
    const buyer = seedUser();
    const detail = await users.setBlocked(adminId, buyer, true, 'fraud');
    expect(detail.status).toBe('blocked');
    expect(revokeAllSessions).toHaveBeenCalledWith(buyer);
    const audit = prisma.auditLog.rows.find((a) => a.action === 'user.block');
    expect(audit).toBeDefined();
  });

  it('refuses to block your own account', async () => {
    await expect(users.setBlocked(adminId, adminId, true, 'x')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('409s when blocking an already-blocked user', async () => {
    const buyer = seedUser({ status: 'blocked' });
    await expect(users.setBlocked(adminId, buyer, true, 'x')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('changes a role, revokes sessions and audits the before→after', async () => {
    const buyer = seedUser({ role: 'user' });
    const detail = await users.setRole(adminId, buyer, 'operator', 'promoted');
    expect(detail.role).toBe('operator');
    expect(revokeAllSessions).toHaveBeenCalledWith(buyer);
    const audit = prisma.auditLog.rows.find((a) => a.action === 'user.role_change');
    expect(audit?.diff).toMatchObject({ from: 'user', to: 'operator' });
  });

  it('refuses to change your own role', async () => {
    await expect(users.setRole(adminId, adminId, 'manager', undefined)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
