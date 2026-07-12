import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception';
import { makeFakePrismaService } from '../testing/fakes';
import { LedgerService } from './ledger.service';
import type { LedgerTx } from './ledger.service';

describe('LedgerService', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let ledger: LedgerService;
  let userId: string;

  const tx = (): LedgerTx => prisma as unknown as LedgerTx;

  beforeEach(async () => {
    prisma = makeFakePrismaService();
    ledger = new LedgerService();
    const user = await prisma.user.create({
      data: { email: 'wallet@advault.dev', passwordHash: 'x' },
    });
    userId = user.id;
  });

  it('credit bumps the cached balance and snapshots balanceAfter', async () => {
    const entry = await ledger.credit(tx(), {
      userId,
      amount: '100.00',
      refType: 'topup',
      refId: randomUUID(),
    });
    expect(entry.direction).toBe('credit');
    expect(entry.amount.toFixed(2)).toBe('100.00');
    expect(entry.balanceAfter.toFixed(2)).toBe('100.00');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user!.balance.toFixed(2)).toBe('100.00');
  });

  it('keeps double-entry invariants over a sequence of credits', async () => {
    await ledger.credit(tx(), { userId, amount: '10.00', refType: 'topup', refId: randomUUID() });
    await ledger.credit(tx(), { userId, amount: '2.50', refType: 'topup', refId: randomUUID() });
    const last = await ledger.credit(tx(), {
      userId,
      amount: '0.01',
      refType: 'topup',
      refId: randomUUID(),
    });

    expect(last.balanceAfter.toFixed(2)).toBe('12.51');
    const fromLedger = await ledger.balanceFromLedger(tx(), userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(fromLedger.equals(user!.balance)).toBe(true);
  });

  it('refuses to post the same source twice (unique refType+refId+direction)', async () => {
    const refId = randomUUID();
    await ledger.credit(tx(), { userId, amount: '5.00', refType: 'topup', refId });
    const error = await ledger
      .credit(tx(), { userId, amount: '5.00', refType: 'topup', refId })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).code).toBe('CONFLICT');
  });

  it('rejects non-positive amounts', async () => {
    await expect(
      ledger.credit(tx(), { userId, amount: '0', refType: 'topup', refId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      ledger.credit(tx(), {
        userId,
        amount: new Prisma.Decimal('-3'),
        refType: 'topup',
        refId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
