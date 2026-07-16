import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from './metrics.service';
import type { DriftRow } from './ops.logic';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';

interface Stubs {
  driftRows: DriftRow[];
  pending: number;
  expiredPending: number;
  queueCounts: Awaited<ReturnType<NotificationsService['queueJobCounts']>> | 'throw';
}

function makeService(stubs: Partial<Stubs> = {}): MetricsService {
  const {
    driftRows = [],
    pending = 0,
    expiredPending = 0,
    queueCounts = { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 },
  } = stubs;

  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue(driftRows),
    topUp: {
      count: vi
        .fn()
        // First call (pending), second call (expired pending).
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(expiredPending),
    },
  } as unknown as PrismaService;

  const notifications = {
    queueJobCounts:
      queueCounts === 'throw'
        ? vi.fn().mockRejectedValue(new Error('redis down'))
        : vi.fn().mockResolvedValue(queueCounts),
  } as unknown as NotificationsService;

  return new MetricsService(prisma, notifications);
}

describe('MetricsService', () => {
  it('assembles all three metric groups', async () => {
    const metrics = await makeService({
      driftRows: [{ userId: 'a', cached: '10.00', ledger: '8.00' }],
      pending: 5,
      expiredPending: 1,
      queueCounts: { waiting: 2, active: 0, delayed: 1, failed: 3, completed: 50 },
    }).collect();

    expect(metrics.reconciliation).toMatchObject({
      balanced: false,
      driftingUsers: 1,
      totalDrift: '2.00',
    });
    expect(metrics.notificationsQueue).toEqual({
      available: true,
      waiting: 2,
      active: 0,
      delayed: 1,
      failed: 3,
      completed: 50,
    });
    expect(metrics.topUps).toEqual({ pending: 5, expiredPending: 1 });
    expect(new Date(metrics.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('marks the queue unavailable when no queue is wired', async () => {
    const metrics = await makeService({ queueCounts: null }).collect();
    expect(metrics.notificationsQueue.available).toBe(false);
  });

  it('degrades gracefully when reading queue depth throws', async () => {
    const metrics = await makeService({ queueCounts: 'throw' }).collect();
    expect(metrics.notificationsQueue.available).toBe(false);
    expect(metrics.notificationsQueue.waiting).toBe(0);
  });
});
