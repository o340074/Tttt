import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from './idempotency.service';
import { LedgerService } from './ledger.service';
import { PAYMENT_PROVIDERS } from './payments/payment-provider';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type {
  LedgerEntry as DbLedgerEntry,
  TopUp as DbTopUp,
  User as DbUser,
} from '@prisma/client';
import type {
  LedgerDirection,
  LedgerEntry,
  LedgerRefType,
  Paginated,
  TopUp,
  TopUpAsset,
  TopUpStatus,
  Wallet,
} from '@advault/types';
import type { CreateTopUpDto } from './dto/wallet.dto';
import type { PaymentProvider } from './payments/payment-provider';

const RECENT_ENTRIES = 5;
const TOPUP_MIN = new Prisma.Decimal('1.00');
const TOPUP_MAX = new Prisma.Decimal('100000.00');
const TOPUPS_ENDPOINT = 'POST /wallet/topups';
/** How often pending top-ups past their expiresAt are swept to `expired`. */
const EXPIRY_SWEEP_MS = 60_000;

export function toLedgerEntryResponse(row: DbLedgerEntry): LedgerEntry {
  return {
    id: row.id,
    direction: row.direction as LedgerDirection,
    amount: row.amount.toFixed(2),
    balanceAfter: row.balanceAfter.toFixed(2),
    refType: row.refType as LedgerRefType,
    refId: row.refId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTopUpResponse(row: DbTopUp): TopUp {
  return {
    id: row.id,
    provider: row.provider,
    amount: row.amount.toFixed(2),
    asset: row.asset as TopUpAsset,
    status: row.status as TopUpStatus,
    paymentUrl: row.paymentUrl,
    address: row.address,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
  };
}

@Injectable()
export class WalletService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
    @Inject(PAYMENT_PROVIDERS) private readonly providers: PaymentProvider[],
  ) {}

  // ---------- Views ----------

  async getWallet(userId: string): Promise<Wallet> {
    const user = await this.requireUser(userId);
    const recent = await this.prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_ENTRIES,
    });
    await this.reconcileBalance(user);
    return {
      balance: user.balance.toFixed(2),
      currency: 'USD',
      recent: recent.map(toLedgerEntryResponse),
    };
  }

  async listTransactions(
    userId: string,
    page: number,
    limit: number,
  ): Promise<Paginated<LedgerEntry>> {
    await this.requireUser(userId);
    const [rows, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ledgerEntry.count({ where: { userId } }),
    ]);
    return { data: rows.map(toLedgerEntryResponse), meta: { total, page, limit } };
  }

  // ---------- Top-ups ----------

  async createTopUp(userId: string, dto: CreateTopUpDto, idempotencyKey: string): Promise<TopUp> {
    await this.requireUser(userId);
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lt(TOPUP_MIN) || amount.gt(TOPUP_MAX)) {
      throw new ApiException('VALIDATION_ERROR', 'Top-up amount is out of range', 400, {
        fields: { amount: [`must be between ${TOPUP_MIN.toFixed(2)} and ${TOPUP_MAX.toFixed(2)}`] },
      });
    }

    const replay = await this.idempotency.claim(idempotencyKey, TOPUPS_ENDPOINT, userId, dto);
    if (replay) return replay.body as TopUp;

    const provider = this.providers[0];
    if (!provider) throw new ApiException('INTERNAL_ERROR', 'No payment provider registered', 500);
    try {
      const topUp = await this.prisma.topUp.create({
        data: { userId, provider: provider.name, amount, asset: dto.asset },
      });
      // External call happens outside any DB transaction; externalId lands
      // before the client ever sees the address, so a webhook can't outrun it.
      const intent = await provider.createPayment({
        topUpId: topUp.id,
        amount: amount.toFixed(2),
        asset: dto.asset,
      });
      const ready = await this.prisma.topUp.update({
        where: { id: topUp.id },
        data: {
          externalId: intent.externalId,
          address: intent.address,
          paymentUrl: intent.paymentUrl,
          expiresAt: intent.expiresAt,
        },
      });
      const response = toTopUpResponse(ready);
      await this.idempotency.saveResponse(idempotencyKey, TOPUPS_ENDPOINT, 201, response);
      return response;
    } catch (error) {
      // Free the key so the client may retry the same request.
      await this.idempotency.release(idempotencyKey, TOPUPS_ENDPOINT);
      throw error;
    }
  }

  async getTopUp(userId: string, id: string): Promise<TopUp> {
    const row = await this.prisma.topUp.findFirst({ where: { id, userId } });
    if (!row) throw new ApiException('NOT_FOUND', 'Top-up not found', 404);
    if (row.status === 'pending' && row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      // Lazy expiry on read; the sweep below covers top-ups nobody polls.
      const updated = await this.prisma.topUp.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'expired' },
      });
      if (updated.count > 0) return toTopUpResponse({ ...row, status: 'expired' });
    }
    return toTopUpResponse(row);
  }

  // ---------- Webhook ----------

  /**
   * Acquirer webhook: verify the signature over the raw body, then settle the
   * top-up. Crediting is idempotent — the status transition claim plus the
   * ledger unique (refType, refId, direction) make double credit impossible.
   */
  async processWebhook(
    providerName: string,
    rawBody: Buffer,
    signature: string | undefined,
    payload: unknown,
  ): Promise<{ received: true }> {
    const provider = this.providers.find((candidate) => candidate.name === providerName);
    if (!provider) throw new ApiException('NOT_FOUND', 'Unknown payment provider', 404);
    if (!provider.verifyWebhook(rawBody, signature)) {
      throw new ApiException('INVALID_SIGNATURE', 'Webhook signature verification failed', 401);
    }
    const event = provider.parseWebhook(payload);
    if (!event) throw new ApiException('VALIDATION_ERROR', 'Malformed webhook payload', 400);

    const topUp = await this.prisma.topUp.findUnique({ where: { externalId: event.externalId } });
    if (!topUp) {
      // Not ours — acknowledge so the provider stops retrying.
      this.logger.warn(`Webhook for unknown externalId ignored (provider=${providerName})`);
      return { received: true };
    }

    if (event.status === 'failed') {
      await this.prisma.topUp.updateMany({
        where: { id: topUp.id, status: 'pending' },
        data: { status: 'failed' },
      });
      return { received: true };
    }

    await this.prisma.$transaction(async (tx) => {
      // A payment that arrives after expiry still credits — funds were received.
      const claimed = await tx.topUp.updateMany({
        where: { id: topUp.id, status: { in: ['pending', 'expired'] } },
        data: {
          status: 'paid',
          paidAt: new Date(),
          ...(event.fee !== undefined ? { fee: new Prisma.Decimal(event.fee) } : {}),
        },
      });
      if (claimed.count === 0) return; // already paid — idempotent replay
      await this.ledger.credit(tx, {
        userId: topUp.userId,
        amount: topUp.amount,
        refType: 'topup',
        refId: topUp.id,
      });
    });
    return { received: true };
  }

  // ---------- Expiry sweep ----------

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => {
      void this.expireOverduePending();
    }, EXPIRY_SWEEP_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async expireOverduePending(): Promise<number> {
    try {
      const result = await this.prisma.topUp.updateMany({
        where: { status: 'pending', expiresAt: { lt: new Date() } },
        data: { status: 'expired' },
      });
      if (result.count > 0) this.logger.log(`Expired ${result.count} overdue pending top-up(s)`);
      return result.count;
    } catch (error) {
      this.logger.warn(`Top-up expiry sweep failed: ${(error as Error).message}`);
      return 0;
    }
  }

  // ---------- Internals ----------

  private async requireUser(userId: string): Promise<DbUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiException('UNAUTHORIZED', 'User no longer exists', 401);
    if (user.status === 'blocked') throw new ApiException('FORBIDDEN', 'Account is blocked', 403);
    return user;
  }

  /** docs/05: User.balance is a cache — verify it against the ledger truth. */
  private async reconcileBalance(user: DbUser): Promise<void> {
    const fromLedger = await this.ledger.balanceFromLedger(this.prisma, user.id);
    if (!fromLedger.equals(user.balance)) {
      this.logger.error(
        `Balance mismatch for user ${user.id}: cache=${user.balance.toFixed(2)} ledger=${fromLedger.toFixed(2)}`,
      );
    }
  }
}
