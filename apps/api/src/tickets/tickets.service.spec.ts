import { beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service';
import { makeFakePrismaService } from '../testing/fakes';
import { TicketsService } from './tickets.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Buyer support portal over the fakes: create → reply lifecycle, owner scoping
 * (a foreign ticket is a 404), internal-note stripping, the pending→open
 * reopen on a buyer reply, and the closed-ticket guard.
 */
describe('TicketsService (E9 buyer portal)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let tickets: TicketsService;

  const seedUser = async (email: string): Promise<string> => {
    const u = await prisma.user.create({ data: { email, passwordHash: 'x' } });
    return u.id;
  };

  beforeEach(() => {
    prisma = makeFakePrismaService();
    tickets = new TicketsService(prisma as unknown as PrismaService, new AuditService(prisma));
  });

  it('creates a ticket that starts open with a public first message', async () => {
    const buyer = await seedUser('buyer@x.io');
    const t = await tickets.create(buyer, { subject: 'Need help', body: 'Hello' });
    expect(t.status).toBe('open');
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0]!.authorRole).toBe('customer');
    expect(t.number).toMatch(/^TK-\d{4}-\d{6}$/);
  });

  it("returns 404 for another user's ticket (owner scoping)", async () => {
    const alice = await seedUser('alice@x.io');
    const bob = await seedUser('bob@x.io');
    const t = await tickets.create(alice, { subject: 'A', body: 'a' });
    await expect(tickets.get(bob, t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('hides internal staff notes from the buyer view', async () => {
    const buyer = await seedUser('buyer2@x.io');
    const staff = await seedUser('support2@x.io');
    const t = await tickets.create(buyer, { subject: 'S', body: 'b' });
    // A staff public reply + an internal note (as the admin side would write).
    await prisma.ticketMessage.create({
      data: { ticketId: t.id, authorId: staff, body: 'staff reply', isInternal: false },
    });
    await prisma.ticketMessage.create({
      data: { ticketId: t.id, authorId: staff, body: 'SECRET internal', isInternal: true },
    });

    const view = await tickets.get(buyer, t.id);
    const bodies = view.messages.map((m) => m.body);
    expect(bodies).toContain('staff reply');
    expect(bodies).not.toContain('SECRET internal');
    expect(view.messages.find((m) => m.body === 'staff reply')!.authorRole).toBe('staff');
  });

  it('reopens a pending ticket to open when the buyer replies', async () => {
    const buyer = await seedUser('buyer3@x.io');
    const t = await tickets.create(buyer, { subject: 'S', body: 'b' });
    // Simulate staff having moved it to pending.
    await prisma.ticket.update({ where: { id: t.id }, data: { status: 'pending' } });

    const after = await tickets.addMessage(buyer, t.id, { body: 'still broken' });
    expect(after.status).toBe('open');
    expect(after.messages.at(-1)!.authorRole).toBe('customer');
  });

  it('refuses replies on a closed ticket (409)', async () => {
    const buyer = await seedUser('buyer4@x.io');
    const t = await tickets.create(buyer, { subject: 'S', body: 'b' });
    await prisma.ticket.update({ where: { id: t.id }, data: { status: 'closed' } });
    await expect(tickets.addMessage(buyer, t.id, { body: 'hi' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('rejects linking an order the buyer does not own', async () => {
    const alice = await seedUser('alice2@x.io');
    const bob = await seedUser('bob2@x.io');
    const order = await prisma.order.create({
      data: {
        userId: bob,
        number: 'AV-1',
        status: 'paid',
        subtotal: '10.00',
        discount: '0.00',
        total: '10.00',
        currency: 'USD',
        promoCodeId: null,
      },
    });
    await expect(
      tickets.create(alice, { subject: 'S', body: 'b', orderId: order.id }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
