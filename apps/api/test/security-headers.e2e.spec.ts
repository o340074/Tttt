import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { makeFakePrismaService, makeFakeRedisService } from '../src/testing/fakes';
import type { INestApplication } from '@nestjs/common';

/** Verifies the helmet hardening set is applied to every response (docs/09). */
describe('Security headers (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(makeFakePrismaService())
      .overrideProvider(RedisService)
      .useValue(makeFakeRedisService())
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets a strict CSP, frame, sniff and referrer policy on responses', async () => {
    const res = await request(http).get('/api/v1/health').expect(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('does not leak the Express fingerprint', async () => {
    const res = await request(http).get('/api/v1/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
