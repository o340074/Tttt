import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService, type LedgerTx } from '../wallet/ledger.service';
import {
  buildInviteLink,
  generateReferralCode,
  maskEmail,
  normalizeReferralCode,
} from './referrals.logic';
import type { Env } from '../config/env';
import type { MyReferral, ReferralStats, ReferralView } from '@advault/types';
import type { Referral as DbReferral, ReferralCode as DbReferralCode } from '@prisma/client';

/** How many code-mint attempts before giving up on a unique collision. */
const CODE_ATTEMPTS = 5;

/**
 * Referral programme (E12, docs/16 §E12+). A user's stable invite code lives in
 * ReferralCode (minted lazily on first view). A Referral is captured at the
 * referee's registration; their first qualifying purchase posts a reward to
 * each side through the ledger (Decimal, idempotent) and flips the row to
 * `qualified`. Reward amounts are snapshotted at qualification so later config
 * changes never rewrite history. Attribution and notification are best-effort —
 * they must never break registration or checkout.
 */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get enabled(): boolean {
    return this.config.get('REFERRAL_ENABLED', { infer: true });
  }
  private get referrerReward(): Prisma.Decimal {
    return new Prisma.Decimal(this.config.get('REFERRAL_REFERRER_REWARD', { infer: true }));
  }
  private get refereeReward(): Prisma.Decimal {
    return new Prisma.Decimal(this.config.get('REFERRAL_REFEREE_REWARD', { infer: true }));
  }
  private get minPurchase(): Prisma.Decimal {
    return new Prisma.Decimal(this.config.get('REFERRAL_MIN_PURCHASE', { infer: true }));
  }

  // ---------- My referral view ----------

  /** The current user's invite code, link, reward terms, stats and referrals. */
  async getMyReferral(userId: string): Promise<MyReferral> {
    const code = await this.ensureCode(userId);
    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { referee: { select: { email: true } } },
    });
    const webUrl = this.config.get('WEB_URL', { infer: true });
    return {
      code: code.code,
      link: buildInviteLink(webUrl, code.code),
      enabled: this.enabled,
      terms: {
        referrerReward: this.referrerReward.toFixed(2),
        refereeReward: this.refereeReward.toFixed(2),
        minPurchase: this.minPurchase.toFixed(2),
      },
      stats: this.buildStats(referrals),
      referrals: referrals.map((r) => this.toReferralView(r)),
    };
  }

  private buildStats(referrals: DbReferral[]): ReferralStats {
    let pending = 0;
    let qualified = 0;
    let earned = new Prisma.Decimal(0);
    for (const r of referrals) {
      if (r.status === 'pending') pending += 1;
      if (r.status === 'qualified') {
        qualified += 1;
        earned = earned.plus(r.referrerReward);
      }
    }
    return { total: referrals.length, pending, qualified, earned: earned.toFixed(2) };
  }

  private toReferralView(r: DbReferral & { referee: { email: string } }): ReferralView {
    return {
      id: r.id,
      refereeMasked: maskEmail(r.referee.email),
      status: r.status,
      reward: r.status === 'qualified' ? r.referrerReward.toFixed(2) : '0.00',
      createdAt: r.createdAt.toISOString(),
      qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
    };
  }

  /** Get the user's code, minting one on first access (collision-safe). */
  async ensureCode(userId: string): Promise<DbReferralCode> {
    const existing = await this.prisma.referralCode.findUnique({ where: { userId } });
    if (existing) return existing;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.referralCode.create({
          data: { userId, code: generateReferralCode() },
        });
      } catch (error) {
        // Another request minted this user's code first — return theirs.
        if (isUnique(error, 'userId')) {
          const found = await this.prisma.referralCode.findUnique({ where: { userId } });
          if (found) return found;
        }
        // Rare code collision — retry with a fresh code.
        if (isUnique(error, 'code') && attempt < CODE_ATTEMPTS) continue;
        throw error;
      }
    }
  }

  // ---------- Attribution (called from registration) ----------

  /**
   * Attribute a freshly registered user to a referral code. Best-effort: an
   * unknown code, a self-referral or any error is swallowed so registration
   * always succeeds. The unique refereeId means a user is attributed at most once.
   */
  async attributeOnRegister(refereeId: string, rawCode: string | undefined): Promise<void> {
    if (!rawCode) return;
    try {
      const code = await this.prisma.referralCode.findUnique({
        where: { code: normalizeReferralCode(rawCode) },
      });
      if (!code || code.userId === refereeId) return; // unknown or self-referral
      await this.prisma.referral.create({
        data: { referrerId: code.userId, refereeId, codeId: code.id },
      });
      await this.audit.record({
        actorId: refereeId,
        action: 'referral.attributed',
        entity: 'Referral',
        diff: { referrerId: code.userId, code: code.code },
      });
    } catch (error) {
      // Duplicate attribution (unique refereeId) or any hiccup — never block signup.
      this.logger.warn(`attributeOnRegister failed for ${refereeId}: ${String(error)}`);
    }
  }

  // ---------- Qualification (called from checkout) ----------

  /**
   * Inside the checkout transaction: if the buyer has a pending referral and the
   * paid total clears the minimum, flip it to `qualified` and credit both sides
   * through the ledger. Idempotent (status-guarded flip + ledger unique keys) and
   * atomic with the purchase. Rewards are snapshotted on the referral row.
   */
  async qualifyWithinCheckout(
    tx: LedgerTx,
    refereeId: string,
    order: { id: string; total: Prisma.Decimal },
  ): Promise<void> {
    if (!this.enabled) return;
    if (order.total.lt(this.minPurchase)) return;
    const referral = await tx.referral.findUnique({ where: { refereeId } });
    if (!referral || referral.status !== 'pending') return;

    const referrerReward = this.referrerReward;
    const refereeReward = this.refereeReward;
    const flipped = await tx.referral.updateMany({
      where: { id: referral.id, status: 'pending' },
      data: {
        status: 'qualified',
        referrerReward,
        refereeReward,
        qualifyingOrderId: order.id,
        qualifiedAt: new Date(),
      },
    });
    if (flipped.count === 0) return; // lost the race — already qualified

    // Reward the inviter (refId = referral) and the buyer (refId = qualifying order);
    // distinct refIds keep the ledger's (refType, refId, direction) unique per side.
    if (referrerReward.gt(0)) {
      await this.ledger.credit(tx, {
        userId: referral.referrerId,
        amount: referrerReward,
        refType: 'referral',
        refId: referral.id,
      });
    }
    if (refereeReward.gt(0)) {
      await this.ledger.credit(tx, {
        userId: refereeId,
        amount: refereeReward,
        refType: 'referral',
        refId: order.id,
      });
    }
  }

  /**
   * Post-commit: if a referral qualified on this order, audit it and notify the
   * inviter. Best-effort — a notification failure never affects the order.
   */
  async notifyQualified(orderId: string): Promise<void> {
    try {
      const referral = await this.prisma.referral.findFirst({
        where: { qualifyingOrderId: orderId, status: 'qualified' },
      });
      if (!referral) return;
      await this.audit.record({
        actorId: null,
        action: 'referral.qualified',
        entity: 'Referral',
        entityId: referral.id,
        diff: {
          orderId,
          referrerReward: referral.referrerReward.toFixed(2),
          refereeReward: referral.refereeReward.toFixed(2),
        },
      });
      if (referral.referrerReward.gt(0)) {
        const reward = referral.referrerReward.toFixed(2);
        await this.notifications.emit(
          referral.referrerId,
          'referralRewarded',
          { reward },
          { referralReward: reward },
        );
      }
    } catch (error) {
      this.logger.warn(`notifyQualified failed for order ${orderId}: ${String(error)}`);
    }
  }
}

function isUnique(error: unknown, field: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta?.target ?? '').includes(field)
  );
}
