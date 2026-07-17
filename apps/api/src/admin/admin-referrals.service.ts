import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdminReferral,
  AdminReferralList,
  ReferralStatus,
} from '@advault/types';

const REFERRAL_INCLUDE = {
  referrer: { select: { email: true } },
  referee: { select: { email: true } },
  code: { select: { code: true } },
} satisfies Prisma.ReferralInclude;

type ReferralRow = Prisma.ReferralGetPayload<{ include: typeof REFERRAL_INCLUDE }>;

/**
 * Referral oversight (E12, docs/13). Managers/admins read the queue with
 * programme-wide totals and may cancel a *pending* referral for abuse (a
 * qualified one already paid out and is immutable). Every cancel is audited.
 */
@Injectable()
export class AdminReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    page: number,
    limit: number,
    status: ReferralStatus | undefined,
  ): Promise<AdminReferralList> {
    const where: Prisma.ReferralWhereInput = status ? { status } : {};
    const [rows, total, summary] = await Promise.all([
      this.prisma.referral.findMany({
        where,
        include: REFERRAL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.referral.count({ where }),
      this.summary(),
    ]);
    return {
      data: (rows as ReferralRow[]).map((row) => this.toAdminView(row)),
      meta: { total, page, limit },
      summary,
    };
  }

  /** Cancel a pending referral (abuse). Qualified/cancelled rows are immutable. */
  async cancel(actorId: string, id: string, reason: string): Promise<AdminReferral> {
    const existing = await this.prisma.referral.findUnique({ where: { id } });
    if (!existing) throw new ApiException('NOT_FOUND', 'Referral not found', 404);
    if (existing.status !== 'pending') {
      throw new ApiException('CONFLICT', 'Only a pending referral can be cancelled', 409, {
        status: existing.status,
      });
    }
    const updated = await this.prisma.referral.update({
      where: { id },
      data: { status: 'cancelled', cancelledReason: reason },
      include: REFERRAL_INCLUDE,
    });
    await this.audit.record({
      actorId,
      action: 'referral.cancelled',
      entity: 'Referral',
      entityId: id,
      diff: { reason },
    });
    return this.toAdminView(updated as ReferralRow);
  }

  private async summary(): Promise<AdminReferralList['summary']> {
    const [grouped, rewards] = await Promise.all([
      this.prisma.referral.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.referral.aggregate({
        where: { status: 'qualified' },
        _sum: { referrerReward: true, refereeReward: true },
      }),
    ]);
    const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
    const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
    const zero = new Prisma.Decimal(0);
    const rewardsPaid = (rewards._sum.referrerReward ?? zero).plus(
      rewards._sum.refereeReward ?? zero,
    );
    return {
      total,
      pending: byStatus.get('pending') ?? 0,
      qualified: byStatus.get('qualified') ?? 0,
      cancelled: byStatus.get('cancelled') ?? 0,
      rewardsPaid: rewardsPaid.toFixed(2),
    };
  }

  private toAdminView(row: ReferralRow): AdminReferral {
    return {
      id: row.id,
      status: row.status,
      code: row.code.code,
      referrerEmail: row.referrer.email,
      refereeEmail: row.referee.email,
      referrerReward: row.referrerReward.toFixed(2),
      refereeReward: row.refereeReward.toFixed(2),
      qualifyingOrderId: row.qualifyingOrderId,
      createdAt: row.createdAt.toISOString(),
      qualifiedAt: row.qualifiedAt?.toISOString() ?? null,
      cancelledReason: row.cancelledReason,
    };
  }
}
