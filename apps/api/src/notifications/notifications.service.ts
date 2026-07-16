import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { readNotifications, readStore, SETTING_KEYS } from '../admin/settings.logic';
import { EVENT_TO_TYPE, renderTemplate } from './notifications.logic';
import { DELIVER_JOB, NOTIFICATION_JOB_OPTIONS, NOTIFICATIONS_QUEUE } from './notifications.queue';
import type { NotificationEvent } from './notifications.logic';
import type { NotificationJob } from './notifications.queue';
import type { Locale, NotificationView, Paginated } from '@advault/types';
import type { Notification as DbNotification } from '@prisma/client';

/** Deep-link context stored on a notification (non-secret only). */
export type NotificationData = NotificationView['data'];

/**
 * Notifications (E9, hardened in E11). On a transactional event we render the
 * store's template (from Settings) in the recipient's locale and deliver two
 * ways: a persisted in-app Notification (feed + unread badge) and a
 * transactional email via the mailer.
 *
 * Delivery runs off a BullMQ queue with retries/backoff (E9 debt): `emit`
 * enqueues a job and returns immediately, so a slow email transport never
 * blocks the caller's request, and a transient failure is retried instead of
 * lost. When no queue is wired (unit/e2e tests), `emit` delivers inline so the
 * synchronous contract those suites rely on still holds. Either way `emit`
 * never throws — a notification must not roll back the business action that
 * triggered it. The read APIs are strictly scoped to the owner.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    @Optional()
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly queue?: Queue<NotificationJob>,
  ) {}

  /**
   * Enqueue delivery of a notification to one user (or deliver inline when no
   * queue is configured). Never throws: any failure is logged and swallowed so
   * the caller's request still succeeds.
   */
  async emit(
    userId: string,
    event: NotificationEvent,
    vars: Record<string, string>,
    data: NotificationData = {},
  ): Promise<void> {
    const job: NotificationJob = { userId, event, vars, data };
    if (this.queue) {
      try {
        await this.queue.add(DELIVER_JOB, job, NOTIFICATION_JOB_OPTIONS);
        return;
      } catch (error) {
        // Enqueue failed (e.g. Redis down) — fall back to a best-effort inline
        // delivery so the notification is not silently dropped.
        this.logger.warn(`enqueue(${event}) failed, delivering inline: ${String(error)}`);
      }
    }
    try {
      await this.deliver(job);
    } catch (error) {
      this.logger.error(`deliver(${event}) failed for user ${userId}: ${String(error)}`);
    }
  }

  /**
   * BullMQ queue depth for monitoring (M5, docs/17 §3). Returns null when no
   * queue is wired (tests / inline delivery) so the ops metrics can report the
   * queue as unavailable rather than fabricating zeros.
   */
  async queueJobCounts(): Promise<{
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
  } | null> {
    if (!this.queue) return null;
    const c = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    return {
      waiting: c.waiting ?? 0,
      active: c.active ?? 0,
      delayed: c.delayed ?? 0,
      failed: c.failed ?? 0,
      completed: c.completed ?? 0,
    };
  }

  /**
   * Render + deliver a single notification job. Throws on failure so the queue
   * worker retries; the inline path in `emit` wraps this and swallows instead.
   */
  async deliver(job: NotificationJob): Promise<void> {
    const { userId, event, vars, data } = job;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, locale: true },
    });
    if (!user) return;

    const rows = await this.readSettingRows();
    const templates = readNotifications(rows[SETTING_KEYS.notifications]);
    const { defaultLocale } = readStore(rows[SETTING_KEYS.store]);
    const rendered = renderTemplate(templates[event], user.locale as Locale, defaultLocale, vars);

    await this.prisma.notification.create({
      data: {
        userId,
        type: EVENT_TO_TYPE[event],
        title: rendered.subject,
        body: rendered.body,
        data,
      },
    });
    // Email is a parallel channel (stub transport in dev; never logs secrets).
    this.mailer.sendNotification(user.email, rendered.subject, rendered.body);
  }

  async list(
    userId: string,
    page: number,
    limit: number,
    unreadOnly: boolean,
  ): Promise<Paginated<NotificationView>> {
    const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      data: (rows as DbNotification[]).map((row) => this.toView(row)),
      meta: { total, page, limit },
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Mark one notification read — scoped to the owner (foreign/unknown = no-op). */
  async markRead(userId: string, id: string): Promise<number> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return this.unreadCount(userId);
  }

  async markAllRead(userId: string): Promise<number> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return 0;
  }

  // ---------- Internals ----------

  private async readSettingRows(): Promise<Record<string, unknown>> {
    const stored = await this.prisma.setting.findMany();
    const rows: Record<string, unknown> = {};
    for (const s of stored) rows[s.key] = s.value;
    return rows;
  }

  private toView(row: DbNotification): NotificationView {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      data: (row.data ?? {}) as NotificationData,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
