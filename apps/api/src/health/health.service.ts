import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@advault/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const API_VERSION = '0.1.0';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([this.prisma.isHealthy(), this.redis.isHealthy()]);

    return {
      status: database && redis ? 'ok' : 'degraded',
      version: API_VERSION,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        database: database ? 'up' : 'down',
        redis: redis ? 'up' : 'down',
      },
    };
  }
}
