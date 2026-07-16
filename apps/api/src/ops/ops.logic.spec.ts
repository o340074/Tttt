import { describe, expect, it } from 'vitest';
import { computeReconciliation, formatPrometheus } from './ops.logic';
import type { DriftRow } from './ops.logic';
import type { OpsMetrics } from '@advault/types';

describe('computeReconciliation', () => {
  it('reports balanced when no rows drift', () => {
    const metric = computeReconciliation([]);
    expect(metric.balanced).toBe(true);
    expect(metric.driftingUsers).toBe(0);
    expect(metric.totalDrift).toBe('0.00');
    expect(metric.sample).toEqual([]);
  });

  it('sums absolute drift and signs each delta correctly', () => {
    const rows: DriftRow[] = [
      { userId: 'a', cached: '10.00', ledger: '7.50' }, // +2.50
      { userId: 'b', cached: '5.00', ledger: '9.00' }, // -4.00
    ];
    const metric = computeReconciliation(rows);
    expect(metric.balanced).toBe(false);
    expect(metric.driftingUsers).toBe(2);
    // Absolute drift: 2.50 + 4.00
    expect(metric.totalDrift).toBe('6.50');
    const a = metric.sample.find((e) => e.userId === 'a');
    const b = metric.sample.find((e) => e.userId === 'b');
    expect(a?.delta).toBe('2.50');
    expect(b?.delta).toBe('-4.00');
  });

  it('orders the sample worst-drift first and caps it', () => {
    const rows: DriftRow[] = [
      { userId: 'small', cached: '1.00', ledger: '0.00' },
      { userId: 'big', cached: '0.00', ledger: '100.00' },
      { userId: 'mid', cached: '10.00', ledger: '0.00' },
    ];
    const metric = computeReconciliation(rows, 2);
    expect(metric.driftingUsers).toBe(3); // count is not capped
    expect(metric.sample).toHaveLength(2); // sample is capped
    expect(metric.sample.map((e) => e.userId)).toEqual(['big', 'mid']);
  });
});

describe('formatPrometheus', () => {
  const metrics: OpsMetrics = {
    timestamp: '2026-07-16T00:00:00.000Z',
    reconciliation: { balanced: false, driftingUsers: 2, totalDrift: '6.50', sample: [] },
    notificationsQueue: {
      available: true,
      waiting: 3,
      active: 1,
      delayed: 0,
      failed: 4,
      completed: 99,
    },
    topUps: { pending: 5, expiredPending: 2 },
  };

  it('emits HELP/TYPE headers and numeric values', () => {
    const text = formatPrometheus(metrics);
    expect(text).toContain('# TYPE advault_balance_drifting_users gauge');
    expect(text).toContain('advault_balance_drifting_users 2');
    expect(text).toContain('advault_balance_total_drift 6.5');
    expect(text).toContain('advault_notifications_queue_available 1');
    expect(text).toContain('advault_notifications_queue_failed 4');
    expect(text).toContain('advault_topups_expired_pending 2');
  });

  it('renders queue availability as 0 when unavailable', () => {
    const text = formatPrometheus({
      ...metrics,
      notificationsQueue: { ...metrics.notificationsQueue, available: false },
    });
    expect(text).toContain('advault_notifications_queue_available 0');
  });
});
