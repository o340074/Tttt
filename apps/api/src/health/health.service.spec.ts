import { describe, expect, it } from 'vitest';
import { HealthService, API_VERSION } from './health.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

function makeService(db: boolean, redis: boolean): HealthService {
  const prisma = { isHealthy: async () => db } as unknown as PrismaService;
  const redisService = { isHealthy: async () => redis } as unknown as RedisService;
  return new HealthService(prisma, redisService);
}

describe('HealthService', () => {
  it('reports ok when all dependencies are up', async () => {
    const health = await makeService(true, true).check();
    expect(health.status).toBe('ok');
    expect(health.version).toBe(API_VERSION);
    expect(health.dependencies).toEqual({ database: 'up', redis: 'up' });
    expect(typeof health.uptime).toBe('number');
    expect(new Date(health.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('reports degraded when the database is down', async () => {
    const health = await makeService(false, true).check();
    expect(health.status).toBe('degraded');
    expect(health.dependencies.database).toBe('down');
    expect(health.dependencies.redis).toBe('up');
  });

  it('reports degraded when redis is down', async () => {
    const health = await makeService(true, false).check();
    expect(health.status).toBe('degraded');
    expect(health.dependencies.redis).toBe('down');
  });
});
