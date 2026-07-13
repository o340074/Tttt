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

  describe('debit (E4)', () => {
    beforeEach(async () => {
      await ledger.credit(tx(), {
        userId,
        amount: '100.00',
        refType: 'topup',
        refId: randomUUID(),
      });
    });

    it('debits the cached balance and snapshots balanceAfter', async () => {
      const entry = await ledger.debit(tx(), {
        userId,
        amount: '42.00',
        refType: 'order',
        refId: randomUUID(),
      });
      expect(entry.direction).toBe('debit');
      expect(entry.amount.toFixed(2)).toBe('42.00');
      expect(entry.balanceAfter.toFixed(2)).toBe('58.00');

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user!.balance.toFixed(2)).toBe('58.00');
      const fromLedger = await ledger.balanceFromLedger(tx(), userId);
      expect(fromLedger.equals(user!.balance)).toBe(true);
    });

    it('throws INSUFFICIENT_BALANCE and the transaction rolls the decrement back', async () => {
      const error = await prisma
        .$transaction((transaction) =>
          ledger.debit(transaction as LedgerTx, {
            userId,
            amount: '100.01',
            refType: 'order',
            refId: randomUUID(),
          }),
        )
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(ApiException);
      expect((error as ApiException).code).toBe('INSUFFICIENT_BALANCE');
      expect((error as ApiException).details).toEqual({
        required: '100.01',
        available: '100.00',
      });

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user!.balance.toFixed(2)).toBe('100.00');
      expect(prisma.ledgerEntry.rows.filter((r) => r.direction === 'debit')).toHaveLength(0);
    });

    it('refuses to debit the same order twice (unique refType+refId+direction)', async () => {
      const refId = randomUUID();
      await ledger.debit(tx(), { userId, amount: '10.00', refType: 'order', refId });
      await expect(
        ledger.debit(tx(), { userId, amount: '10.00', refType: 'order', refId }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('rejects non-positive debit amounts', async () => {
      await expect(
        ledger.debit(tx(), { userId, amount: '0', refType: 'order', refId: randomUUID() }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });
});
