import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import { NotificationsQueryDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';
import { uuidParam } from '../common/uuid-param';
import type { NotificationView, Paginated, UnreadCountResponse } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

/**
 * In-app notifications for the signed-in user (E9). Every route is scoped to
 * `CurrentUser` — a buyer only ever sees and mutates their own notifications.
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(
    @CurrentUser() user: AccessPayload,
    @Query() query: NotificationsQueryDto,
  ): Promise<Paginated<NotificationView>> {
    return this.notifications.list(user.sub, query.page, query.limit, query.unread);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AccessPayload): Promise<UnreadCountResponse> {
    return { unread: await this.notifications.unreadCount(user.sub) };
  }

  @Post('read-all')
  @HttpCode(200)
  async markAllRead(@CurrentUser() user: AccessPayload): Promise<UnreadCountResponse> {
    return { unread: await this.notifications.markAllRead(user.sub) };
  }

  @Post(':id/read')
  @HttpCode(200)
  async markRead(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidParam()) id: string,
  ): Promise<UnreadCountResponse> {
    return { unread: await this.notifications.markRead(user.sub, id) };
  }
}
