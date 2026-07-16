import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service';
import { makeFakeNotificationsService, makeFakePrismaService } from '../testing/fakes';
import { AdminTicketsService } from './admin-tickets.service';
import type { Role } from '@advault/types';

/**
 * AdminTicketsService over the in-memory fakes: the end-to-end support flow —
 * create (on behalf of a customer) → assign → reply → internal note → resolve →
 * close — plus the guards (unknown requester, foreign order, closed-ticket
 * reply) and the audit entries on every mutation.
 */
describe('AdminTicketsService (E8 tickets)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let tickets: AdminTicketsService;
  const supportId = randomUUID();

  const seedUser = (over: Partial<{ role: Role; email: string }> = {}): string => {
    const id = randomUUID();
    prisma.user.rows.push({
      id,
      email: over.email ?? `u-${id}@example.com`,
      passwordHash: 'x',
      role: (over.role ?? 'user') as Role,
      status: 'active',
      balance: new Prisma.Decimal('0.00'),
      locale: 'en',
      emailVerifiedAt: null,
      twoFactorSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  };

  beforeEach(() => {
    prisma = makeFakePrismaService();
    tickets = new AdminTicketsService(
      prisma,
      new AuditService(prisma),
      makeFakeNotificationsService(prisma),
    );
    prisma.user.rows.push({
      id: supportId,
      email: 'support@example.com',
      passwordHash: 'x',
      role: 'support',
      status: 'active',
      balance: new Prisma.Decimal('0.00'),
      locale: 'en',
      emailVerifiedAt: null,
      twoFactorSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('creates a ticket on behalf of a customer with an opening message', async () => {
    seedUser({ email: 'buyer@shop.com' });
    const ticket = await tickets.create(supportId, {
      subject: 'Where is my account?',
      body: 'It has been 3 hours.',
      requesterEmail: 'buyer@shop.com',
    });
    expect(ticket.number).toMatch(/^TK-\d{4}-\d{6}$/);
    expect(ticket.status).toBe('open');
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0]!.isInternal).toBe(false);
    expect(prisma.auditLog.rows.some((a) => a.action === 'ticket.create')).toBe(true);
  });

  it('404s when the requester email is unknown', async () => {
    await expect(
      tickets.create(supportId, {
        subject: 'x',
        body: 'y',
        requesterEmail: 'ghost@nowhere.com',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an order that does not belong to the requester', async () => {
    seedUser({ email: 'buyer@shop.com' });
    const otherId = seedUser({ email: 'other@shop.com' });
    const orderId = randomUUID();
    prisma.order.rows.push({
      id: orderId,
      userId: otherId,
      number: 'AV-9',
      status: 'paid',
      subtotal: new Prisma.Decimal('10'),
      discount: new Prisma.Decimal('0'),
      total: new Prisma.Decimal('10'),
      currency: 'USD',
      promoCodeId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(
      tickets.create(supportId, {
        subject: 'x',
        body: 'y',
        requesterEmail: 'buyer@shop.com',
        orderId,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('runs the full lifecycle: assign → reply → note → resolve → close', async () => {
    seedUser({ email: 'buyer@shop.com' });
    const ticket = await tickets.create(supportId, {
      subject: 'Help',
      body: 'Hi',
      requesterEmail: 'buyer@shop.com',
    });

    const assigned = await tickets.update(supportId, ticket.id, { assigneeId: supportId });
    expect(assigned.assignee?.id).toBe(supportId);

    const replied = await tickets.addMessage(supportId, ticket.id, { body: 'On it!' });
    // A public reply on an open ticket moves it to "pending".
    expect(replied.status).toBe('pending');
    expect(replied.messages).toHaveLength(2);

    const noted = await tickets.addMessage(supportId, ticket.id, {
      body: 'internal: escalate',
      isInternal: true,
    });
    expect(noted.messages.at(-1)!.isInternal).toBe(true);
    expect(noted.status).toBe('pending'); // note does not change state

    const resolved = await tickets.update(supportId, ticket.id, { status: 'resolved' });
    expect(resolved.status).toBe('resolved');

    const closed = await tickets.update(supportId, ticket.id, { status: 'closed' });
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).not.toBeNull();
  });

  it('refuses to reply to a closed ticket', async () => {
    seedUser({ email: 'buyer@shop.com' });
    const ticket = await tickets.create(supportId, {
      subject: 'Help',
      body: 'Hi',
      requesterEmail: 'buyer@shop.com',
    });
    await tickets.update(supportId, ticket.id, { status: 'closed' });
    await expect(tickets.addMessage(supportId, ticket.id, { body: 'late' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('rejects assigning to a non-staff user', async () => {
    seedUser({ email: 'buyer@shop.com' });
    const buyerId = seedUser({ email: 'buyer2@shop.com' });
    const ticket = await tickets.create(supportId, {
      subject: 'Help',
      body: 'Hi',
      requesterEmail: 'buyer@shop.com',
    });
    await expect(
      tickets.update(supportId, ticket.id, { assigneeId: buyerId }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('filters the queue by status and search', async () => {
    seedUser({ email: 'buyer@shop.com' });
    await tickets.create(supportId, {
      subject: 'Refund please',
      body: 'x',
      requesterEmail: 'buyer@shop.com',
    });
    await tickets.create(supportId, {
      subject: 'Delivery slow',
      body: 'y',
      requesterEmail: 'buyer@shop.com',
    });
    const byQuery = await tickets.list({ q: 'refund' }, 1, 20);
    expect(byQuery.meta.total).toBe(1);
    expect(byQuery.data[0]!.subject).toBe('Refund please');

    const open = await tickets.list({ status: 'open' }, 1, 20);
    expect(open.meta.total).toBe(2);
  });
});
