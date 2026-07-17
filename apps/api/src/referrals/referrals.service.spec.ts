import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeFakePrismaService, makeFakeReferralsService } from '../testing/fakes';
import { ReferralsService } from './referrals.service';
import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';

describe('ReferralsService (E12)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let service: ReferralsService;
  let referrerId: string;
  let refereeId: string;

  const makeService = (overrides: Partial<Env> = {}): ReferralsService =>
    makeFakeReferralsService(prisma, overrides);

  const seedUser = async (email: string): Promise<string> => {
    const u = await prisma.user.create({ data: { email, passwordHash: 'x' } });
    return u.id;
  };

  const order = (total: string) => ({ id: randomUUID(), total: new Prisma.Decimal(total) });

  beforeEach(async () => {
    prisma = makeFakePrismaService();
    service = makeService();
    referrerId = await seedUser('inviter@advault.dev');
    refereeId = await seedUser('friend@advault.dev');
  });

  it('mints a stable code on first view and reuses it after', async () => {
    const first = await service.getMyReferral(referrerId);
    expect(first.code).toMatch(/^AV-/);
    expect(first.link).toContain(`ref=${first.code}`);
    expect(first.stats).toEqual({ total: 0, pending: 0, qualified: 0, earned: '0.00' });
    const second = await service.getMyReferral(referrerId);
    expect(second.code).toBe(first.code);
    expect(prisma.referralCode.rows).toHaveLength(1);
  });

  it('attributes a new user to a valid code', async () => {
    const { code } = await service.getMyReferral(referrerId);
    await service.attributeOnRegister(refereeId, code.toLowerCase()); // case-insensitive
    expect(prisma.referral.rows).toHaveLength(1);
    expect(prisma.referral.rows[0]).toMatchObject({ referrerId, refereeId, status: 'pending' });
  });

  it('ignores an unknown code and a self-referral', async () => {
    await service.attributeOnRegister(refereeId, 'AV-NOPE00');
    expect(prisma.referral.rows).toHaveLength(0);

    const { code } = await service.getMyReferral(referrerId);
    await service.attributeOnRegister(referrerId, code); // owner referring themselves
    expect(prisma.referral.rows).toHaveLength(0);
  });

  it('qualifies a pending referral on a clearing purchase, crediting both sides', async () => {
    const { code } = await service.getMyReferral(referrerId);
    await service.attributeOnRegister(refereeId, code);

    await prisma.$transaction((tx) =>
      service.qualifyWithinCheckout(tx as unknown as PrismaService, refereeId, order('42.00')),
    );

    const referral = prisma.referral.rows[0]!;
    expect(referral.status).toBe('qualified');
    expect(referral.referrerReward.toFixed(2)).toBe('5.00');
    expect(referral.refereeReward.toFixed(2)).toBe('5.00');

    // Both balances credited via the ledger (refType referral).
    const referrer = await prisma.user.findUnique({ where: { id: referrerId } });
    const referee = await prisma.user.findUnique({ where: { id: refereeId } });
    expect(referrer!.balance.toFixed(2)).toBe('5.00');
    expect(referee!.balance.toFixed(2)).toBe('5.00');
    const ledger = prisma.ledgerEntry.rows.filter((r) => r.refType === 'referral');
    expect(ledger).toHaveLength(2);
    // Distinct refIds keep the ledger unique per side.
    expect(new Set(ledger.map((r) => r.refId)).size).toBe(2);
  });

  it('is idempotent: a second qualify posts nothing new', async () => {
    const { code } = await service.getMyReferral(referrerId);
    await service.attributeOnRegister(refereeId, code);
    const ord = order('42.00');
    await prisma.$transaction((tx) =>
      service.qualifyWithinCheckout(tx as unknown as PrismaService, refereeId, ord),
    );
    await prisma.$transaction((tx) =>
      service.qualifyWithinCheckout(tx as unknown as PrismaService, refereeId, ord),
    );
    expect(prisma.ledgerEntry.rows.filter((r) => r.refType === 'referral')).toHaveLength(2);
    const referrer = await prisma.user.findUnique({ where: { id: referrerId } });
    expect(referrer!.balance.toFixed(2)).toBe('5.00');
  });

  it('does not qualify below the minimum purchase', async () => {
    const { code } = await service.getMyReferral(referrerId);
    await service.attributeOnRegister(refereeId, code);
    await prisma.$transaction((tx) =>
      service.qualifyWithinCheckout(tx as unknown as PrismaService, refereeId, order('9.99')),
    );
    expect(prisma.referral.rows[0]!.status).toBe('pending');
    expect(prisma.ledgerEntry.rows.filter((r) => r.refType === 'referral')).toHaveLength(0);
  });

  it('posts nothing when the programme is disabled', async () => {
    service = makeService({ REFERRAL_ENABLED: false });
    const { code } = await service.getMyReferral(referrerId);
    await service.attributeOnRegister(refereeId, code);
    await prisma.$transaction((tx) =>
      service.qualifyWithinCheckout(tx as unknown as PrismaService, refereeId, order('42.00')),
    );
    expect(prisma.referral.rows[0]!.status).toBe('pending');
  });

  it('notifyQualified writes a reward notification to the inviter', async () => {
    const { code } = await service.getMyReferral(referrerId);
    await service.attributeOnRegister(refereeId, code);
    const ord = order('42.00');
    await prisma.$transaction((tx) =>
      service.qualifyWithinCheckout(tx as unknown as PrismaService, refereeId, ord),
    );
    await service.notifyQualified(ord.id);
    const notif = prisma.notification.rows.find((n) => n.userId === referrerId);
    expect(notif?.type).toBe('referral_rewarded');
  });

  it('reflects a qualified referral in the inviter stats (masked referee, earned)', async () => {
    const { code } = await service.getMyReferral(referrerId);
    await service.attributeOnRegister(refereeId, code);
    await prisma.$transaction((tx) =>
      service.qualifyWithinCheckout(tx as unknown as PrismaService, refereeId, order('42.00')),
    );
    const view = await service.getMyReferral(referrerId);
    expect(view.stats).toEqual({ total: 1, pending: 0, qualified: 1, earned: '5.00' });
    expect(view.referrals[0]!.refereeMasked).toBe('f•••@advault.dev');
    expect(view.referrals[0]!.reward).toBe('5.00');
  });
});
