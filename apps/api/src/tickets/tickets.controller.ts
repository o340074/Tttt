import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import { uuidParam } from '../common/uuid-param';
import { CreateMyTicketDto, CreateMyTicketMessageDto, MyTicketsQueryDto } from './dto/tickets.dto';
import { TicketsService } from './tickets.service';
import type { Paginated, TicketDetailView, TicketSummary } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

/**
 * Buyer support portal (E9). Every route is scoped to `CurrentUser` — a buyer
 * only ever reaches their own tickets, and internal staff notes are stripped
 * from every response by the service.
 */
@ApiTags('Support')
@ApiBearerAuth()
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  async list(
    @CurrentUser() user: AccessPayload,
    @Query() query: MyTicketsQueryDto,
  ): Promise<Paginated<TicketSummary>> {
    return this.tickets.list(user.sub, query.page, query.limit, query.status);
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessPayload,
    @Body() dto: CreateMyTicketDto,
  ): Promise<TicketDetailView> {
    return this.tickets.create(user.sub, dto);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidParam()) id: string,
  ): Promise<TicketDetailView> {
    return this.tickets.get(user.sub, id);
  }

  @Post(':id/messages')
  @HttpCode(201)
  async addMessage(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidParam()) id: string,
    @Body() dto: CreateMyTicketMessageDto,
  ): Promise<TicketDetailView> {
    return this.tickets.addMessage(user.sub, id, dto);
  }
}
