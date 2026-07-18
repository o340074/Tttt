import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { makeFakePrismaService } from '../testing/fakes';
import { AdminReferralsService } from './admin-referrals.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('AdminReferralsService (E12)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let service: AdminReferralsService;

  const seedUser = (email: string) => prisma.user.create({ data: { email, passwordHash: 'x' } });

  beforeEach(async () => {
    prisma = makeFakePrismaService();
    service = new AdminReferralsService(
      prisma as unknown as PrismaService,
      new AuditService(prisma as unknown as PrismaService),
    );
    const referrer = await seedUser('inviter@advault.dev');
    const code = await prisma.referralCode.create({
      data: { userId: referrer.id, code: 'AV-ABC123' },
    });
    const pendingReferee = await seedUser('p@advault.dev');
    const qualifiedReferee = await seedUser('q@advault.dev');
    await prisma.referral.create({
      data: { referrerId: referrer.id, refereeId: pendingReferee.id, codeId: code.id },
    });
    const qualified = await prisma.referral.create({
      data: { referrerId: referrer.id, refereeId: qualifiedReferee.id, codeId: code.id },
    });
    await prisma.referral.update({
      where: { id: qualified.id },
      data: {
        status: 'qualified',
        referrerReward: new Prisma.Decimal('5.00'),
        refereeReward: new Prisma.Decimal('5.00'),
      },
    });
  });

  it('lists referrals with programme-wide summary totals', async () => {
    const result = await service.list(1, 20, undefined);
    expect(result.meta.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.summary).toEqual({
      total: 2,
      pending: 1,
      qualified: 1,
      cancelled: 0,
      rewardsPaid: '10.00', // 5.00 referrer + 5.00 referee
    });
    // Emails resolved via include, code echoed.
    expect(result.data[0]).toMatchObject({ referrerEmail: 'inviter@advault.dev', code: 'AV-ABC123' });
  });

  it('filters by status', async () => {
    const result = await service.list(1, 20, 'qualified');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.status).toBe('qualified');
  });

  it('cancels a pending referral with a reason', async () => {
    const pending = prisma.referral.rows.find((r) => r.status === 'pending')!;
    const updated = await service.cancel('admin-id', pending.id, 'suspected abuse');
    expect(updated.status).toBe('cancelled');
    expect(updated.cancelledReason).toBe('suspected abuse');
    expect(prisma.auditLog.rows.some((a) => a.action === 'referral.cancelled')).toBe(true);
  });

  it('refuses to cancel a non-pending referral (409)', async () => {
    const qualified = prisma.referral.rows.find((r) => r.status === 'qualified')!;
    const error = await service.cancel('admin-id', qualified.id, 'nope').then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).getStatus()).toBe(409);
  });
});
