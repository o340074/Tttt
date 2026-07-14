import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser, Roles } from '../auth/decorators';
import {
  BindOctoBody,
  BindProxyBody,
  CreateOctoBody,
  CreateProxyBody,
  OctoQueryDto,
  ProxyQueryDto,
  UpdateOctoBody,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';
import type { OctoProfileView, Paginated, ProxyImportReport, ProxyItemView } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';
import type { Request } from 'express';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

/**
 * Operator surface for the proxy / Octo inventory (docs/12, docs/13). RBAC
 * admin/support (support acts as the operator role until StaffUser lands in
 * E8). Provisioning is manual; these endpoints only record resources and bind
 * them to warming jobs (platform boundary, docs/09). Secrets are never
 * returned here — they reach the buyer only through the delivered Vault bundle.
 */
@ApiTags('Inventory')
@ApiBearerAuth()
@Roles('admin', 'support')
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // ---------- Proxies ----------

  @Get('proxies')
  async listProxies(@Query() query: ProxyQueryDto): Promise<Paginated<ProxyItemView>> {
    return this.inventory.listProxies(
      { status: query.status, type: query.type, unassigned: query.unassigned },
      query.page,
      query.limit,
    );
  }

  @Post('proxies')
  @HttpCode(201)
  async createProxy(
    @CurrentUser() user: AccessPayload,
    @Body() body: CreateProxyBody,
  ): Promise<ProxyItemView> {
    return this.inventory.createProxy(user.sub, body);
  }

  /** Bulk import — JSON `{ items: [...] }` or a raw text/plain file (see service). */
  @Post('proxies/import')
  @HttpCode(201)
  async importProxies(
    @CurrentUser() user: AccessPayload,
    @Req() req: Request,
  ): Promise<ProxyImportReport> {
    return this.inventory.importProxies(user.sub, req.body);
  }

  @Post('proxies/:id/bind')
  @HttpCode(200)
  async bindProxy(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() body: BindProxyBody,
  ): Promise<ProxyItemView> {
    return this.inventory.bindProxy(user.sub, id, body.jobId);
  }

  @Post('proxies/:id/unbind')
  @HttpCode(200)
  async unbindProxy(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
  ): Promise<ProxyItemView> {
    return this.inventory.unbindProxy(user.sub, id);
  }

  // ---------- Octo profiles ----------

  @Get('octo')
  async listOcto(@Query() query: OctoQueryDto): Promise<Paginated<OctoProfileView>> {
    return this.inventory.listOcto(
      { status: query.status, unassigned: query.unassigned },
      query.page,
      query.limit,
    );
  }

  @Post('octo')
  @HttpCode(201)
  async createOcto(
    @CurrentUser() user: AccessPayload,
    @Body() body: CreateOctoBody,
  ): Promise<OctoProfileView> {
    return this.inventory.createOcto(user.sub, body);
  }

  @Patch('octo/:id')
  async updateOcto(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() body: UpdateOctoBody,
  ): Promise<OctoProfileView> {
    return this.inventory.updateOcto(user.sub, id, body);
  }

  @Post('octo/:id/bind')
  @HttpCode(200)
  async bindOcto(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() body: BindOctoBody,
  ): Promise<OctoProfileView> {
    return this.inventory.bindOcto(user.sub, id, body.jobId, body.proxyItemId);
  }

  @Post('octo/:id/unbind')
  @HttpCode(200)
  async unbindOcto(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
  ): Promise<OctoProfileView> {
    return this.inventory.unbindOcto(user.sub, id);
  }
}
