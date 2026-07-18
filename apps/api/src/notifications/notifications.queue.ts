import type { NotificationEvent } from './notifications.logic';
import type { NotificationData } from './notifications.service';

/** BullMQ queue that carries notification deliveries (E9 debt → E11). */
export const NOTIFICATIONS_QUEUE = 'notifications';

/** The single job name on the queue. */
export const DELIVER_JOB = 'deliver';

/** Payload of a queued notification delivery — no secrets, only render inputs. */
export interface NotificationJob {
  userId: string;
  event: NotificationEvent;
  vars: Record<string, string>;
  data: NotificationData;
}

/**
 * Default retry policy for a delivery job: a transient failure (template read,
 * DB write, email transport) is retried with exponential backoff. Completed
 * jobs are dropped; a bounded tail of failures is kept for inspection.
 */
export const NOTIFICATION_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: true,
  removeOnFail: 100,
};
