import { beforeEach, describe, expect, it } from 'vitest';
import { makeFakeNotificationsService, makeFakePrismaService } from '../testing/fakes';
import type { NotificationsService } from './notifications.service';

/**
 * NotificationsService over the fakes: emit renders the Settings template in the
 * recipient's locale and persists an in-app row; the read APIs are strictly
 * scoped to the owner (unread count, mark-read, mark-all).
 */
describe('NotificationsService (E9)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let notifications: NotificationsService;

  const seedUser = async (locale: 'en' | 'ru'): Promise<string> => {
    const u = await prisma.user.create({
      data: { email: `u-${locale}-${Date.now()}-${Math.random()}@x.io`, passwordHash: 'x', locale },
    });
    return u.id;
  };

  beforeEach(() => {
    prisma = makeFakePrismaService();
    notifications = makeFakeNotificationsService(prisma);
  });

  it('emits an in-app notification rendered in the recipient locale (RU)', async () => {
    const userId = await seedUser('ru');
    await notifications.emit(userId, 'orderPaid', { number: 'AV-42' }, { orderNumber: 'AV-42' });

    const rows = prisma.notification.rows.filter((r) => r.userId === userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('order_paid');
    expect(rows[0]!.title).toContain('подтверждён');
    expect(rows[0]!.body).toContain('AV-42');
    expect(rows[0]!.readAt).toBeNull();
  });

  it('renders EN for an EN recipient and substitutes {{number}}', async () => {
    const userId = await seedUser('en');
    await notifications.emit(userId, 'ticketReply', { number: 'TK-1' });
    const row = prisma.notification.rows.find((r) => r.userId === userId)!;
    expect(row.type).toBe('ticket_reply');
    expect(row.body).toContain('TK-1');
    expect(row.title).toMatch(/replied/i);
  });

  it('never throws when the recipient is unknown', async () => {
    await expect(
      notifications.emit('00000000-0000-0000-0000-000000000000', 'orderPaid', { number: 'x' }),
    ).resolves.toBeUndefined();
    expect(prisma.notification.rows).toHaveLength(0);
  });

  it('scopes unread-count, list and mark-read to the owner', async () => {
    const alice = await seedUser('en');
    const bob = await seedUser('en');
    await notifications.emit(alice, 'orderPaid', { number: 'A-1' });
    await notifications.emit(alice, 'ticketReply', { number: 'A-2' });
    await notifications.emit(bob, 'orderPaid', { number: 'B-1' });

    expect(await notifications.unreadCount(alice)).toBe(2);
    expect(await notifications.unreadCount(bob)).toBe(1);

    const page = await notifications.list(alice, 1, 20, false);
    expect(page.meta.total).toBe(2);
    // Newest first.
    expect(page.data[0]!.title).toBeTruthy();

    // Bob cannot mark Alice's notification read (foreign id → no-op).
    const aliceFirst = prisma.notification.rows.find((r) => r.userId === alice)!;
    expect(await notifications.markRead(bob, aliceFirst.id)).toBe(1); // bob still has 1 unread
    expect(await notifications.unreadCount(alice)).toBe(2); // unchanged

    // Alice marks her own read; unread drops.
    expect(await notifications.markRead(alice, aliceFirst.id)).toBe(1);
    const unreadOnly = await notifications.list(alice, 1, 20, true);
    expect(unreadOnly.meta.total).toBe(1);

    // Mark-all clears the rest.
    expect(await notifications.markAllRead(alice)).toBe(0);
    expect(await notifications.unreadCount(alice)).toBe(0);
  });
});
