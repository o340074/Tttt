import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { makeFakePrismaService, makeFakeRedisService } from '../src/testing/fakes';
import type { INestApplication } from '@nestjs/common';

/**
 * Buyer support portal + notifications over HTTP (E9). Covers the full loop:
 * a buyer opens a ticket, a support agent replies (public) and adds an internal
 * note, the buyer sees the reply but never the note, and a `ticket_reply`
 * notification lands in the buyer's in-app feed. Also asserts owner scoping
 * (a second buyer gets 404) and the admin queue's customer-reply indicator.
 */
describe('Support portal + notifications (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const prisma = makeFakePrismaService();

  let buyerToken = '';
  let otherBuyerToken = '';
  let supportToken = '';
  let supportId = '';

  const promote = async (email: string, role: string): Promise<{ token: string; id: string }> => {
    await request(http)
      .post('/api/v1/auth/register')
      .send({ email, password: 'password-123' })
      .expect(201);
    const row = prisma.user.rows.find((u) => u.email === email)!;
    row.role = role as (typeof row)['role'];
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password-123' })
      .expect(200);
    return { token: login.body.accessToken as string, id: row.id };
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const url = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(makeFakeRedisService())
      .compile();
    app = configureApp(moduleRef.createNestApplication({ rawBody: true }));
    await app.init();
    http = app.getHttpServer();

    buyerToken = (await promote('buyer-p@advault.test', 'user')).token;
    otherBuyerToken = (await promote('buyer-other@advault.test', 'user')).token;
    const support = await promote('support-p@advault.test', 'support');
    supportToken = support.token;
    supportId = support.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs the buyer portal end-to-end with notifications + owner scoping', async () => {
    // 1) Buyer opens a ticket from their account.
    const created = await request(http)
      .post(url('/tickets'))
      .set(auth(buyerToken))
      .send({ subject: 'My account is missing', body: 'Where is my order?' })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body.status).toBe('open');
    expect(created.body.messages).toHaveLength(1);
    expect(created.body.messages[0].authorRole).toBe('customer');

    // 2) Buyer sees it in their own list.
    const list = await request(http).get(url('/tickets')).set(auth(buyerToken)).expect(200);
    expect(list.body.data.some((t: { id: string }) => t.id === id)).toBe(true);

    // 3) A different buyer cannot read it (owner scoping → 404).
    await request(http)
      .get(url(`/tickets/${id}`))
      .set(auth(otherBuyerToken))
      .expect(404);

    // 4) Support assigns + replies (public) then adds an internal note.
    await request(http)
      .patch(url(`/admin/tickets/${id}`))
      .set(auth(supportToken))
      .send({ assigneeId: supportId })
      .expect(200);
    await request(http)
      .post(url(`/admin/tickets/${id}/messages`))
      .set(auth(supportToken))
      .send({ body: 'On it — checking your delivery now.' })
      .expect(201);
    await request(http)
      .post(url(`/admin/tickets/${id}/messages`))
      .set(auth(supportToken))
      .send({ body: 'internal: escalate to ops', isInternal: true })
      .expect(201);

    // 5) Buyer view shows the public reply as "staff" but NEVER the internal note.
    const detail = await request(http)
      .get(url(`/tickets/${id}`))
      .set(auth(buyerToken))
      .expect(200);
    const bodies = detail.body.messages.map((m: { body: string }) => m.body);
    expect(bodies).toContain('On it — checking your delivery now.');
    expect(bodies.some((b: string) => b.includes('internal'))).toBe(false);
    expect(
      detail.body.messages.find((m: { body: string }) => m.body.startsWith('On it'))?.authorRole,
    ).toBe('staff');

    // 6) The public reply produced an in-app notification for the buyer.
    const count = await request(http)
      .get(url('/notifications/unread-count'))
      .set(auth(buyerToken))
      .expect(200);
    expect(count.body.unread).toBe(1);

    const feed = await request(http).get(url('/notifications')).set(auth(buyerToken)).expect(200);
    expect(feed.body.data[0].type).toBe('ticket_reply');
    expect(feed.body.data[0].data.ticketNumber).toBe(created.body.number);
    const notifId = feed.body.data[0].id as string;

    // Other buyer has no notifications (scoping).
    const otherCount = await request(http)
      .get(url('/notifications/unread-count'))
      .set(auth(otherBuyerToken))
      .expect(200);
    expect(otherCount.body.unread).toBe(0);

    // 7) Buyer replies → ticket reopens to "open" and the admin queue flags it.
    const reopened = await request(http)
      .post(url(`/tickets/${id}/messages`))
      .set(auth(buyerToken))
      .send({ body: 'Still nothing, please help.' })
      .expect(201);
    expect(reopened.body.status).toBe('open');

    const queue = await request(http)
      .get(url('/admin/tickets'))
      .set(auth(supportToken))
      .expect(200);
    const row = queue.body.data.find((t: { id: string }) => t.id === id);
    expect(row.lastMessageFromCustomer).toBe(true);

    // 8) Buyer marks the notification read → unread badge clears.
    await request(http)
      .post(url(`/notifications/${notifId}/read`))
      .set(auth(buyerToken))
      .expect(200);
    const after = await request(http)
      .get(url('/notifications/unread-count'))
      .set(auth(buyerToken))
      .expect(200);
    expect(after.body.unread).toBe(0);
  });

  it('blocks anonymous access to the portal and notifications', async () => {
    await request(http).get(url('/tickets')).expect(401);
    await request(http).get(url('/notifications/unread-count')).expect(401);
  });
});
