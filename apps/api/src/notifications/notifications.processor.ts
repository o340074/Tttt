import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_QUEUE } from './notifications.queue';
import type { NotificationJob } from './notifications.queue';
import type { Job } from 'bullmq';

/**
 * BullMQ worker for notification deliveries (E11). Delegates to
 * `NotificationsService.deliver`, which throws on failure so BullMQ applies the
 * configured retries/backoff. Registered only outside the test environment (see
 * NotificationsModule) — tests deliver inline.
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger('NotificationsWorker');

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    await this.notifications.deliver(job.data);
  }
}
