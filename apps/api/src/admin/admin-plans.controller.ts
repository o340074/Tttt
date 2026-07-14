import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser, Roles } from '../auth/decorators';
import { CATALOG_STAFF } from '../auth/roles';
import { AdminPlansService } from './admin-plans.service';
import { CreateWarmingPlanDto, UpdateWarmingPlanDto } from './dto/admin-plans.dto';
import type { AdminWarmingPlanDetail, AdminWarmingPlanListItem } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

/**
 * Warming-plan CRUD (docs/13 §6). Managers/admins only. Editing stages bumps
 * the plan version and recomputes linked variants' ETA; in-flight jobs keep
 * their pinned snapshot (docs/15). Every mutation is audited.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...CATALOG_STAFF)
@Controller('admin/warming-plans')
export class AdminPlansController {
  constructor(private readonly plans: AdminPlansService) {}

  @Get()
  async list(): Promise<AdminWarmingPlanListItem[]> {
    return this.plans.list();
  }

  @Get(':id')
  async get(@Param('id', uuidPipe) id: string): Promise<AdminWarmingPlanDetail> {
    return this.plans.get(id);
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() actor: AccessPayload,
    @Body() dto: CreateWarmingPlanDto,
  ): Promise<AdminWarmingPlanDetail> {
    return this.plans.create(actor.sub, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateWarmingPlanDto,
  ): Promise<AdminWarmingPlanDetail> {
    return this.plans.update(actor.sub, id, dto);
  }
}
