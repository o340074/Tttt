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
 * Smoke over HTTP for the last E8 admin modules — tickets, reports, staff,
 * settings. The point is the RBAC matrix (support owns tickets; reports are
 * manager+; settings are admin-only; operators are locked out of support) plus
 * the ticket lifecycle end-to-end: create on behalf of a customer → assign →
 * reply → close.
 */
describe('Admin support/settings smoke (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const prisma = makeFakePrismaService();

  let buyerToken = '';
  let operatorToken = '';
  let supportToken = '';
  let managerToken = '';
  let adminToken = '';
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

    buyerToken = (await promote('buyer-sup@advault.test', 'user')).token;
    operatorToken = (await promote('operator-sup@advault.test', 'operator')).token;
    const support = await promote('support-sup@advault.test', 'support');
    supportToken = support.token;
    supportId = support.id;
    managerToken = (await promote('manager-sup@advault.test', 'manager')).token;
    adminToken = (await promote('admin-sup@advault.test', 'admin')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  const url = (p: string) => `/api/v1${p}`;

  it('gates tickets: buyer/operator → 403, support → 200', async () => {
    await request(http).get(url('/admin/tickets')).set(auth(buyerToken)).expect(403);
    await request(http).get(url('/admin/tickets')).set(auth(operatorToken)).expect(403);
    await request(http).get(url('/admin/tickets')).set(auth(supportToken)).expect(200);
  });

  it('gates reports (manager+): support → 403, manager → 200', async () => {
    await request(http).get(url('/admin/reports/dashboard')).set(auth(supportToken)).expect(403);
    const res = await request(http)
      .get(url('/admin/reports/dashboard'))
      .set(auth(managerToken))
      .expect(200);
    expect(res.body).toHaveProperty('revenue');
    expect(res.body.ops).toHaveProperty('openTickets');
  });

  it('gates settings (admin-only): manager → 403, admin → 200 with defaults', async () => {
    await request(http).get(url('/admin/settings')).set(auth(managerToken)).expect(403);
    const res = await request(http).get(url('/admin/settings')).set(auth(adminToken)).expect(200);
    expect(res.body.storeName).toBe('AdVault');
    expect(res.body.integrations).toHaveProperty('kmsConfigured');
  });

  it('lets any staff read the staff list; buyer → 403', async () => {
    await request(http).get(url('/admin/staff')).set(auth(buyerToken)).expect(403);
    const res = await request(http).get(url('/admin/staff')).set(auth(supportToken)).expect(200);
    // At least the staff we seeded show up (buyer excluded).
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((m: { email: string }) => m.email === 'support-sup@advault.test')).toBe(
      true,
    );
  });

  it('runs a ticket end-to-end: create → assign → reply → close', async () => {
    const created = await request(http)
      .post(url('/admin/tickets'))
      .set(auth(supportToken))
      .send({
        subject: 'Account not delivered',
        body: 'Still waiting.',
        requesterEmail: 'buyer-sup@advault.test',
      })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body.messages).toHaveLength(1);

    await request(http)
      .patch(url(`/admin/tickets/${id}`))
      .set(auth(supportToken))
      .send({ assigneeId: supportId })
      .expect(200);

    const replied = await request(http)
      .post(url(`/admin/tickets/${id}/messages`))
      .set(auth(supportToken))
      .send({ body: 'Looking into it.' })
      .expect(201);
    expect(replied.body.status).toBe('pending');

    const closed = await request(http)
      .patch(url(`/admin/tickets/${id}`))
      .set(auth(supportToken))
      .send({ status: 'closed' })
      .expect(200);
    expect(closed.body.status).toBe('closed');

    // A closed ticket refuses further replies.
    await request(http)
      .post(url(`/admin/tickets/${id}/messages`))
      .set(auth(supportToken))
      .send({ body: 'too late' })
      .expect(409);
  });
});
