import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import type { LedgerEntry as DbLedgerEntry } from '@prisma/client';
import type { LedgerRefType } from '@advault/types';

/** The transaction the caller opened; every balance move must live inside one. */
export type LedgerTx = Prisma.TransactionClient;

export interface PostEntryInput {
  userId: string;
  /** Positive Money amount. */
  amount: Prisma.Decimal | string;
  refType: LedgerRefType;
  refId: string;
}

/**
 * Double-entry ledger (docs/05, docs/backend/prisma-schema.md): every money
 * movement appends a LedgerEntry with a balanceAfter snapshot, User.balance
 * being an atomically incremented cache. The composite unique
 * (refType, refId, direction) makes re-posting the same source impossible.
 */
@Injectable()
export class LedgerService {
  /**
   * Post a credit inside the caller's transaction: bump the cached balance
   * and append the entry. Throws CONFLICT when this source is already posted
   * (the transaction rolls the increment back).
   */
  async credit(tx: LedgerTx, input: PostEntryInput): Promise<DbLedgerEntry> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      throw new ApiException('VALIDATION_ERROR', 'Ledger amount must be positive', 400);
    }
    const user = await tx.user.update({
      where: { id: input.userId },
      data: { balance: { increment: amount } },
    });
    try {
      return await tx.ledgerEntry.create({
        data: {
          userId: input.userId,
          direction: 'credit',
          amount,
          balanceAfter: user.balance,
          refType: input.refType,
          refId: input.refId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiException('CONFLICT', 'This source is already posted to the ledger', 409);
      }
      throw error;
    }
  }

  /**
   * Post a debit inside the caller's transaction: decrement the cached
   * balance and append the entry. A balance that would go negative throws
   * INSUFFICIENT_BALANCE (402) — the transaction rolls the decrement back.
   * Re-posting the same source throws CONFLICT via the composite unique.
   */
  async debit(tx: LedgerTx, input: PostEntryInput): Promise<DbLedgerEntry> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      throw new ApiException('VALIDATION_ERROR', 'Ledger amount must be positive', 400);
    }
    const user = await tx.user.update({
      where: { id: input.userId },
      data: { balance: { decrement: amount } },
    });
    if (user.balance.lt(0)) {
      throw new ApiException('INSUFFICIENT_BALANCE', 'Not enough balance', 402, {
        required: amount.toFixed(2),
        available: user.balance.plus(amount).toFixed(2),
      });
    }
    try {
      return await tx.ledgerEntry.create({
        data: {
          userId: input.userId,
          direction: 'debit',
          amount,
          balanceAfter: user.balance,
          refType: input.refType,
          refId: input.refId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiException('CONFLICT', 'This source is already posted to the ledger', 409);
      }
      throw error;
    }
  }

  /** Ledger truth for a user's balance: SUM(credit) − SUM(debit). */
  async balanceFromLedger(tx: LedgerTx, userId: string): Promise<Prisma.Decimal> {
    const [credits, debits] = await Promise.all([
      tx.ledgerEntry.aggregate({ where: { userId, direction: 'credit' }, _sum: { amount: true } }),
      tx.ledgerEntry.aggregate({ where: { userId, direction: 'debit' }, _sum: { amount: true } }),
    ]);
    const zero = new Prisma.Decimal(0);
    return (credits._sum.amount ?? zero).minus(debits._sum.amount ?? zero);
  }
}
