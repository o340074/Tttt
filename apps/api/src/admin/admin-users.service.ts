import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import type {
  AdminUserDetail,
  AdminUserListItem,
  Paginated,
  Role,
  UserStatus,
} from '@advault/types';
import type { Order as DbOrder, User as DbUser } from '@prisma/client';

const CURRENCY = 'USD';
const RECENT_ORDERS = 10;

/**
 * Customer management for the admin surface (docs/13 §10). Reads are staff-wide;
 * blocking is elevated (revokes the user's sessions) and role changes are
 * admin-only (a manager must not escalate anyone to admin). Every mutation is
 * audited with a before→after diff, and staff can never act on their own account.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  async list(
    filters: { q?: string; status?: UserStatus; role?: Role },
    page: number,
    limit: number,
  ): Promise<Paginated<AdminUserListItem>> {
    const where: Prisma.UserWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.role) where.role = filters.role;
    if (filters.q?.trim()) where.email = { contains: filters.q.trim(), mode: 'insensitive' };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { orders: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: (rows as (DbUser & { _count: { orders: number } })[]).map((row) =>
        this.toListItem(row),
      ),
      meta: { total, page, limit },
    };
  }

  async get(id: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: { select: { orders: true } },
        orders: { orderBy: { createdAt: 'desc' }, take: RECENT_ORDERS },
      },
    });
    if (!user) throw new ApiException('NOT_FOUND', 'User not found', 404);
    const row = user as DbUser & { _count: { orders: number }; orders: DbOrder[] };

    const ledgerBalance = await this.prisma.$transaction((tx) =>
      this.ledger.balanceFromLedger(tx, id),
    );

    return {
      ...this.toListItem(row),
      ledgerBalance: ledgerBalance.toFixed(2),
      recentOrders: row.orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        total: o.total.toFixed(2),
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }

  /** Block or unblock a customer; blocking revokes every refresh session. */
  async setBlocked(
    actorId: string,
    id: string,
    blocked: boolean,
    reason: string,
  ): Promise<AdminUserDetail> {
    const user = await this.requireUser(id);
    if (user.id === actorId) {
      throw new ApiException('VALIDATION_ERROR', 'You cannot block your own account', 400);
    }
    const previousStatus = user.status;
    const nextStatus: UserStatus = blocked ? 'blocked' : 'active';
    if (previousStatus === nextStatus) {
      throw new ApiException('CONFLICT', `User is already ${nextStatus}`, 409);
    }

    await this.prisma.user.update({ where: { id }, data: { status: nextStatus } });
    if (blocked) await this.tokens.revokeAllSessions(id);

    await this.audit.record({
      actorId,
      action: blocked ? 'user.block' : 'user.unblock',
      entity: 'User',
      entityId: id,
      diff: { from: previousStatus, to: nextStatus, reason },
    });
    return this.get(id);
  }

  /** Change a customer/staff role (admin-only route). Cannot change own role. */
  async setRole(
    actorId: string,
    id: string,
    role: Role,
    reason: string | undefined,
  ): Promise<AdminUserDetail> {
    const user = await this.requireUser(id);
    if (user.id === actorId) {
      throw new ApiException('VALIDATION_ERROR', 'You cannot change your own role', 400);
    }
    const previousRole = user.role;
    if (previousRole === role) {
      throw new ApiException('CONFLICT', `User already has role ${role}`, 409);
    }

    await this.prisma.user.update({ where: { id }, data: { role } });
    // A demotion from staff should not keep stale operator sessions alive.
    await this.tokens.revokeAllSessions(id);

    await this.audit.record({
      actorId,
      action: 'user.role_change',
      entity: 'User',
      entityId: id,
      diff: { from: previousRole, to: role, ...(reason ? { reason } : {}) },
    });
    return this.get(id);
  }

  // ---------- Internals ----------

  private async requireUser(id: string): Promise<DbUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new ApiException('NOT_FOUND', 'User not found', 404);
    return user;
  }

  private toListItem(row: DbUser & { _count: { orders: number } }): AdminUserListItem {
    return {
      id: row.id,
      email: row.email,
      role: row.role as Role,
      status: row.status as UserStatus,
      balance: row.balance.toFixed(2),
      currency: CURRENCY,
      orderCount: row._count.orders,
      emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
