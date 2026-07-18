import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser, Roles } from '../auth/decorators';
import { WARMING_STAFF } from '../auth/roles';
import { resolveLocale } from '../catalog/locale';
import { InventoryService } from '../inventory/inventory.service';
import {
  AssignWarmingJobBody,
  ResolveWarmingJobBody,
  SetAccountAssetBody,
  UpdateWarmingTaskBody,
  WarmingQueueDto,
  WarmingTransitionBody,
} from './dto/warming.dto';
import { WarmingService } from './warming.service';
import type { JobInventory, Paginated, WarmingJobDetail, WarmingJobSummary } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

/**
 * Operator surface for the warming queue (docs/12, docs/13). RBAC support/admin
 * — support acts as the operator role until StaffUser lands in E8. Actions are
 * status/logistics only; no in-account automation (platform boundary, docs/09).
 */
@ApiTags('Warming')
@ApiBearerAuth()
@Roles(...WARMING_STAFF)
@Controller('admin/warming')
export class WarmingController {
  constructor(
    private readonly warming: WarmingService,
    private readonly inventory: InventoryService,
  ) {}

  @Get('jobs')
  async listJobs(@Query() query: WarmingQueueDto): Promise<Paginated<WarmingJobSummary>> {
    return this.warming.listJobs(
      { status: query.status, goal: query.goal, assignedTo: query.assignedTo },
      query.page,
      query.limit,
      resolveLocale(query.locale),
    );
  }

  @Get('jobs/:id')
  async getJob(
    @Param('id', uuidPipe) id: string,
    @Query() query: WarmingQueueDto,
  ): Promise<WarmingJobDetail> {
    return this.warming.getJob(id, resolveLocale(query.locale));
  }

  /** Resources (proxy + Octo profile) bound to a job — operator view, no secrets. */
  @Get('jobs/:id/inventory')
  async jobInventory(@Param('id', uuidPipe) id: string): Promise<JobInventory> {
    return this.inventory.getJobInventory(id);
  }

  @Post('jobs/:id/assign')
  @HttpCode(200)
  async assign(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() body: AssignWarmingJobBody,
  ): Promise<WarmingJobDetail> {
    return this.warming.assign(user.sub, id, body.operatorId, 'en');
  }

  @Post('jobs/:id/transition')
  @HttpCode(200)
  async transition(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() body: WarmingTransitionBody,
  ): Promise<WarmingJobDetail> {
    return this.warming.transition(user.sub, id, body.action, body.note, 'en');
  }

  @Post('jobs/:id/tasks/:taskId')
  @HttpCode(200)
  async updateTask(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Param('taskId', uuidPipe) taskId: string,
    @Body() body: UpdateWarmingTaskBody,
  ): Promise<WarmingJobDetail> {
    return this.warming.updateTask(user.sub, id, taskId, body, 'en');
  }

  @Post('jobs/:id/account')
  @HttpCode(200)
  async setAccount(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() body: SetAccountAssetBody,
  ): Promise<WarmingJobDetail> {
    return this.warming.setAccountAsset(
      user.sub,
      id,
      { payload: body.payload, recovery: body.recovery, meta: body.meta },
      'en',
    );
  }

  @Post('jobs/:id/resolve')
  @HttpCode(200)
  async resolve(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() body: ResolveWarmingJobBody,
  ): Promise<WarmingJobDetail> {
    return this.warming.resolveFailed(user.sub, id, body.resolution, body.reason, 'en');
  }
}
