import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser, Roles } from '../auth/decorators';
import { SUPPORT_STAFF } from '../auth/roles';
import { AdminTicketsService } from './admin-tickets.service';
import {
  AdminTicketQueryDto,
  CreateTicketDto,
  CreateTicketMessageDto,
  UpdateTicketDto,
} from './dto/admin-tickets.dto';
import type { AdminTicketDetail, AdminTicketListItem, Paginated } from '@advault/types';
import { ParseUUIDPipe } from '@nestjs/common';
import type { AccessPayload } from '../auth/token.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

/**
 * Support tickets (docs/13 §13). Support owns the queue; managers/admins
 * oversee. Operators are excluded — customer correspondence is not their job.
 * Every mutation writes an AuditLog.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...SUPPORT_STAFF)
@Controller('admin/tickets')
export class AdminTicketsController {
  constructor(private readonly tickets: AdminTicketsService) {}

  @Get()
  async list(@Query() query: AdminTicketQueryDto): Promise<Paginated<AdminTicketListItem>> {
    return this.tickets.list(
      { status: query.status, assigneeId: query.assigneeId, q: query.q },
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  async get(@Param('id', uuidPipe) id: string): Promise<AdminTicketDetail> {
    return this.tickets.get(id);
  }

  @Post()
  async create(
    @CurrentUser() actor: AccessPayload,
    @Body() dto: CreateTicketDto,
  ): Promise<AdminTicketDetail> {
    return this.tickets.create(actor.sub, dto);
  }

  @Post(':id/messages')
  async addMessage(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: CreateTicketMessageDto,
  ): Promise<AdminTicketDetail> {
    return this.tickets.addMessage(actor.sub, id, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateTicketDto,
  ): Promise<AdminTicketDetail> {
    return this.tickets.update(actor.sub, id, dto);
  }
}
