import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { NOTIFICATIONS_QUEUE } from './notifications.queue';
import type { DynamicModule } from '@nestjs/common';
import type { Env } from '../config/env';

/**
 * Notification delivery runs off a BullMQ queue with retries (E11). We wire the
 * queue + worker everywhere except the test environment: tests have no Redis and
 * rely on `emit` delivering inline, so registering a live BullMQ worker there
 * would connect eagerly and hang. Outside tests the queue is present, so `emit`
 * enqueues and `NotificationsProcessor` delivers with backoff.
 */
const isTest = process.env.NODE_ENV === 'test';

const bullImports: DynamicModule[] = isTest
  ? []
  : [
      BullModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (config: ConfigService<Env, true>) => {
          const url = new URL(config.get('REDIS_URL', { infer: true }));
          return {
            connection: {
              host: url.hostname,
              port: Number(url.port) || 6379,
              username: url.username || undefined,
              password: url.password || undefined,
              db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) || 0 : 0,
            },
          };
        },
      }),
      BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
    ];

/**
 * Global so any domain service (orders, warming, tickets) can inject
 * NotificationsService to emit on its events without an import cycle.
 */
@Global()
@Module({
  imports: bullImports,
  controllers: [NotificationsController],
  providers: isTest ? [NotificationsService] : [NotificationsService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
