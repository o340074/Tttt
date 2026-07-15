import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { readNotifications, readStore, SETTING_KEYS } from '../admin/settings.logic';
import { EVENT_TO_TYPE, renderTemplate } from './notifications.logic';
import type { NotificationEvent } from './notifications.logic';
import type { Locale, NotificationView, Paginated } from '@advault/types';
import type { Notification as DbNotification } from '@prisma/client';

/** Deep-link context stored on a notification (non-secret only). */
export type NotificationData = NotificationView['data'];

/**
 * Notifications (E9). On a transactional event we render the store's template
 * (from Settings) in the recipient's locale and deliver two ways: a persisted
 * in-app Notification (feed + unread badge) and a transactional email via the
 * mailer. Delivery is synchronous but best-effort — a notification failure must
 * never roll back the business action that triggered it, so `emit` swallows and
 * logs its own errors. The read APIs are strictly scoped to the owner.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Render + deliver a notification to one user. Never throws: any failure is
   * logged and swallowed so the caller's request still succeeds.
   */
  async emit(
    userId: string,
    event: NotificationEvent,
    vars: Record<string, string>,
    data: NotificationData = {},
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, locale: true },
      });
      if (!user) return;

      const rows = await this.readSettingRows();
      const templates = readNotifications(rows[SETTING_KEYS.notifications]);
      const { defaultLocale } = readStore(rows[SETTING_KEYS.store]);
      const rendered = renderTemplate(
        templates[event],
        user.locale as Locale,
        defaultLocale,
        vars,
      );

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
    } catch (error) {
      this.logger.error(`emit(${event}) failed for user ${userId}: ${String(error)}`);
    }
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
