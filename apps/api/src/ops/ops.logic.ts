import { Prisma } from '@prisma/client';
import type { BalanceDriftEntry, OpsMetrics, ReconciliationMetric } from '@advault/types';

/** Raw row from the per-user drift query: cached balance vs ledger truth. */
export interface DriftRow {
  userId: string;
  cached: string;
  ledger: string;
}

/**
 * Fold the drifting-user rows into the reconciliation metric. The DB query
 * already returns only users whose cached balance ≠ ledger truth, so any row
 * here is a genuine mismatch. `totalDrift` sums the absolute deltas; `sample`
 * keeps the worst offenders (capped) for the alert payload. Pure — all money
 * math stays in Decimal, never float.
 */
export function computeReconciliation(rows: DriftRow[], sampleLimit = 20): ReconciliationMetric {
  const zero = new Prisma.Decimal(0);
  let totalDrift = zero;
  const entries: Array<{ entry: BalanceDriftEntry; absDelta: Prisma.Decimal }> = [];

  for (const row of rows) {
    const cached = new Prisma.Decimal(row.cached);
    const ledger = new Prisma.Decimal(row.ledger);
    const delta = cached.minus(ledger);
    const absDelta = delta.abs();
    totalDrift = totalDrift.plus(absDelta);
    entries.push({
      entry: {
        userId: row.userId,
        cached: cached.toFixed(2),
        ledger: ledger.toFixed(2),
        delta: delta.toFixed(2),
      },
      absDelta,
    });
  }

  const sample = entries
    .sort((a, b) => b.absDelta.comparedTo(a.absDelta))
    .slice(0, sampleLimit)
    .map((e) => e.entry);

  return {
    balanced: rows.length === 0,
    driftingUsers: rows.length,
    totalDrift: totalDrift.toFixed(2),
    sample,
  };
}

/** Escape a Prometheus metric help/line value is not needed — we emit numbers only. */
function line(name: string, value: number, help: string, type = 'gauge'): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name} ${value}\n`;
}

/**
 * Render the metrics as a Prometheus text-exposition document so a scraper can
 * alert on drift / queue depth / stuck top-ups without parsing JSON. Money
 * values are emitted as plain numbers (already 2-decimal strings from Decimal).
 */
export function formatPrometheus(metrics: OpsMetrics): string {
  const r = metrics.reconciliation;
  const q = metrics.notificationsQueue;
  const t = metrics.topUps;
  return [
    line(
      'advault_balance_drifting_users',
      r.driftingUsers,
      'Users whose cached balance disagrees with the ledger truth.',
    ),
    line(
      'advault_balance_total_drift',
      Number(r.totalDrift),
      'Sum of absolute per-user balance drift.',
    ),
    line(
      'advault_notifications_queue_available',
      q.available ? 1 : 0,
      'Whether the BullMQ notifications queue was reachable (1/0).',
    ),
    line('advault_notifications_queue_waiting', q.waiting, 'Notification jobs waiting.'),
    line('advault_notifications_queue_active', q.active, 'Notification jobs active.'),
    line(
      'advault_notifications_queue_delayed',
      q.delayed,
      'Notification jobs delayed (retry backoff).',
    ),
    line(
      'advault_notifications_queue_failed',
      q.failed,
      'Notification jobs failed (dead-letter tail).',
    ),
    line('advault_topups_pending', t.pending, 'Top-ups still pending.'),
    line(
      'advault_topups_expired_pending',
      t.expiredPending,
      'Top-ups pending past their expiry (sweep should have closed these).',
    ),
  ].join('');
}
