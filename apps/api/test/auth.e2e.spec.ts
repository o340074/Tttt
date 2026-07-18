import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { makeFakePrismaService, makeFakeRedisService } from '../src/testing/fakes';
import type { INestApplication } from '@nestjs/common';

// Test env (DATABASE_URL etc.) is provided by vitest.config.ts before imports run.
const EMAIL = 'smoke@advault.dev';
const PASSWORD = 'password-123';

/** Smoke test: full register → verify → login → /me → refresh → logout cycle over HTTP. */
describe('Auth smoke (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const redis = makeFakeRedisService();
  const prisma = makeFakePrismaService();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  let accessToken = '';
  let refreshCookie = '';

  const cookieFrom = (res: request.Response): string => {
    const header = res.headers['set-cookie'];
    const cookies = Array.isArray(header) ? header : [header ?? ''];
    const refresh = cookies.find((c) => c.startsWith('refreshToken='));
    expect(refresh).toBeTruthy();
    expect(refresh).toContain('HttpOnly');
    expect(refresh).toContain('SameSite=Strict');
    return refresh!.split(';')[0];
  };

  it('rejects an invalid registration payload with the Error envelope', async () => {
    const res = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields).toHaveProperty('email');
    expect(res.body.error.details.fields).toHaveProperty('password');
  });

  it('registers a new user and returns tokens + refresh cookie', async () => {
    const res = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, password: PASSWORD, locale: 'ru' })
      .expect(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.expiresIn).toBeGreaterThan(0);
    cookieFrom(res);
  });

  it('rejects a duplicate email with EMAIL_ALREADY_USED', async () => {
    const res = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_USED');
  });

  it('verifies the email using the token issued at registration', async () => {
    const key = [...redis.client.store.keys()].find((k) => k.startsWith('auth:verify:'));
    expect(key).toBeTruthy();
    await request(http)
      .post('/api/v1/auth/verify-email')
      .send({ token: key!.replace('auth:verify:', '') })
      .expect(200);
  });

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    const res = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in and returns tokens + refresh cookie', async () => {
    const res = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL.toUpperCase(), password: PASSWORD }) // email is normalized
      .expect(200);
    accessToken = res.body.accessToken;
    refreshCookie = cookieFrom(res);
  });

  it('GET /me returns the profile for a bearer token', async () => {
    const res = await request(http)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.email).toBe(EMAIL);
    expect(res.body.role).toBe('user');
    expect(res.body.locale).toBe('ru');
    expect(res.body.balance).toBe('0.00');
    expect(res.body.emailVerifiedAt).not.toBeNull();
  });

  it('GET /me without a token yields UNAUTHORIZED in the Error envelope', async () => {
    const res = await request(http).get('/api/v1/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('PATCH /me updates the locale', async () => {
    const res = await request(http)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ locale: 'en' })
      .expect(200);
    expect(res.body.locale).toBe('en');
  });

  it('refresh rotates the cookie; the old refresh token is rejected on replay', async () => {
    const res = await request(http)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
    const rotated = cookieFrom(res);
    expect(rotated).not.toBe(refreshCookie);

    const replay = await request(http)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);
    expect(replay.body.error.code).toBe('INVALID_TOKEN');
    refreshCookie = rotated;
  });

  it('logout clears the session; refresh stops working', async () => {
    // Replay detection above revoked the whole family — log in again first.
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    refreshCookie = cookieFrom(login);

    await request(http).post('/api/v1/auth/logout').set('Cookie', refreshCookie).expect(204);
    const res = await request(http)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rate-limits repeated login attempts with RATE_LIMITED', async () => {
    let limited: request.Response | undefined;
    for (let i = 0; i < 6; i += 1) {
      const res = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'limit@advault.dev', password: 'wrong-password' });
      if (res.status === 429) {
        limited = res;
        break;
      }
    }
    expect(limited, 'expected a 429 within 6 attempts').toBeTruthy();
    expect(limited!.body.error.code).toBe('RATE_LIMITED');
  });
});
