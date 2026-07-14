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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser, Roles } from '../auth/decorators';
import { ADMIN_ONLY, ELEVATED, ORDERS_STAFF } from '../auth/roles';
import { AdminUsersService } from './admin-users.service';
import { AdminUserQueryDto, BlockUserDto, UpdateUserRoleDto } from './dto/admin-users.dto';
import type { AdminUserDetail, AdminUserListItem, Paginated } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

/**
 * Customer management (docs/13 §10). Reads are staff-wide (support views
 * users/orders); blocking is elevated and revokes sessions; role changes are
 * admin-only. Every mutation writes an AuditLog with a before→after diff.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...ORDERS_STAFF)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  async list(@Query() query: AdminUserQueryDto): Promise<Paginated<AdminUserListItem>> {
    return this.users.list(
      { q: query.q, status: query.status, role: query.role },
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  async get(@Param('id', uuidPipe) id: string): Promise<AdminUserDetail> {
    return this.users.get(id);
  }

  @Post(':id/block')
  @HttpCode(200)
  @Roles(...ELEVATED)
  async block(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: BlockUserDto,
  ): Promise<AdminUserDetail> {
    return this.users.setBlocked(actor.sub, id, true, dto.reason);
  }

  @Post(':id/unblock')
  @HttpCode(200)
  @Roles(...ELEVATED)
  async unblock(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: BlockUserDto,
  ): Promise<AdminUserDetail> {
    return this.users.setBlocked(actor.sub, id, false, dto.reason);
  }

  @Patch(':id/role')
  @Roles(...ADMIN_ONLY)
  async setRole(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<AdminUserDetail> {
    return this.users.setRole(actor.sub, id, dto.role, dto.reason);
  }
}
