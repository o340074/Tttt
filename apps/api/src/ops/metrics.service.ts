import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { computeReconciliation } from './ops.logic';
import type { DriftRow } from './ops.logic';
import type { OpsMetrics, QueueDepthMetric, TopUpHealthMetric } from '@advault/types';

/**
 * Operational metrics for monitoring/alerting (M5, docs/17 §3). Read-only,
 * no mutations, no audit. Gathers the three signals the runbook calls out:
 * per-user ledger drift (the truthful reconciliation — the SUM check in the
 * finance summary can hide offsetting mismatches), notification-queue depth,
 * and top-ups stuck in `pending`.
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly prisma: PrismaService,
    // NotificationsService is @Global and owns the (optional) BullMQ queue.
    private readonly notifications: NotificationsService,
  ) {}

  async collect(): Promise<OpsMetrics> {
    const [reconciliation, notificationsQueue, topUps] = await Promise.all([
      this.reconciliation(),
      this.queueDepth(),
      this.topUpHealth(),
    ]);
    return {
      timestamp: new Date().toISOString(),
      reconciliation,
      notificationsQueue,
      topUps,
    };
  }

  /**
   * Per-user reconciliation: compare each user's cached balance to their ledger
   * truth (SUM credit − SUM debit) in one grouped query, returning only the
   * users that drift. This catches offsetting mismatches that a global SUM
   * (FinanceSummary.reconciled) would net to zero and miss.
   */
  private async reconciliation() {
    const rows = await this.prisma.$queryRaw<DriftRow[]>(Prisma.sql`
      SELECT u.id AS "userId",
             u.balance::text AS cached,
             COALESCE(SUM(CASE WHEN l.direction::text = 'credit' THEN l.amount ELSE -l.amount END), 0)::text AS ledger
      FROM users u
      LEFT JOIN ledger_entries l ON l."userId" = u.id
      GROUP BY u.id, u.balance
      HAVING u.balance <> COALESCE(SUM(CASE WHEN l.direction::text = 'credit' THEN l.amount ELSE -l.amount END), 0)
      ORDER BY ABS(u.balance - COALESCE(SUM(CASE WHEN l.direction::text = 'credit' THEN l.amount ELSE -l.amount END), 0)) DESC
    `);
    return computeReconciliation(rows);
  }

  /** BullMQ notifications queue depth; degrades to unavailable when no queue. */
  private async queueDepth(): Promise<QueueDepthMetric> {
    const empty: QueueDepthMetric = {
      available: false,
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    };
    try {
      const counts = await this.notifications.queueJobCounts();
      if (!counts) return empty;
      return { available: true, ...counts };
    } catch (error) {
      this.logger.warn(`Queue depth unavailable: ${(error as Error).message}`);
      return empty;
    }
  }

  /** Top-ups stuck in `pending`, and those past expiry the sweep hasn't closed. */
  private async topUpHealth(): Promise<TopUpHealthMetric> {
    const [pending, expiredPending] = await Promise.all([
      this.prisma.topUp.count({ where: { status: 'pending' } }),
      this.prisma.topUp.count({
        where: { status: 'pending', expiresAt: { lt: new Date() } },
      }),
    ]);
    return { pending, expiredPending };
  }
}
