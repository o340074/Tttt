import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service';
import { MailerService } from '../mailer/mailer.service';
import { makeFakeConfigService, makeFakePrismaService } from '../testing/fakes';
import { DELIVER_JOB } from './notifications.queue';
import type { Queue } from 'bullmq';

/**
 * Queue-path behaviour (E11): when a BullMQ queue is wired, `emit` enqueues a
 * delivery job instead of writing inline; if enqueue fails it falls back to an
 * inline best-effort delivery so nothing is dropped. Never throws.
 */
describe('NotificationsService — queue delivery (E11)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  const mailer = new MailerService(makeFakeConfigService());

  const seedUser = async (): Promise<string> => {
    const u = await prisma.user.create({
      data: { email: `q-${Date.now()}-${Math.random()}@x.io`, passwordHash: 'x', locale: 'en' },
    });
    return u.id;
  };

  beforeEach(() => {
    prisma = makeFakePrismaService();
  });

  it('enqueues a delivery job and does not write inline', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue;
    const service = new NotificationsService(prisma, mailer, queue);
    const userId = await seedUser();

    await service.emit(userId, 'orderPaid', { number: 'AV-9' }, { orderNumber: 'AV-9' });

    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]![0]).toBe(DELIVER_JOB);
    expect(add.mock.calls[0]![1]).toMatchObject({ userId, event: 'orderPaid' });
    // Nothing persisted yet — the (absent) worker would do that.
    expect(prisma.notification.rows).toHaveLength(0);
  });

  it('falls back to inline delivery when enqueue throws', async () => {
    const add = vi.fn().mockRejectedValue(new Error('redis down'));
    const queue = { add } as unknown as Queue;
    const service = new NotificationsService(prisma, mailer, queue);
    const userId = await seedUser();

    await expect(service.emit(userId, 'orderPaid', { number: 'AV-9' })).resolves.toBeUndefined();

    // Inline fallback persisted the row despite the failed enqueue.
    expect(prisma.notification.rows.filter((r) => r.userId === userId)).toHaveLength(1);
  });

  it('deliver() throws on a template failure so the worker can retry', async () => {
    const service = new NotificationsService(prisma, mailer);
    const userId = await seedUser();
    // Force a render failure by pointing at an unknown event.
    await expect(
      service.deliver({ userId, event: 'nope' as never, vars: {}, data: {} }),
    ).rejects.toBeTruthy();
  });
});
