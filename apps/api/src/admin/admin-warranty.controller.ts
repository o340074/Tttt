import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser, Roles } from '../auth/decorators';
import { FINANCE_STAFF, WARRANTY_STAFF } from '../auth/roles';
import { resolveLocale } from '../catalog/locale';
import { uuidParam } from '../common/uuid-param';
import { AdminWarrantyService } from './admin-warranty.service';
import { AdminWarrantyClaimsQueryDto, ResolveWarrantyClaimDto } from './dto/admin-warranty.dto';
import type {
  AdminWarrantyClaimDetail,
  AdminWarrantyClaimListItem,
  Paginated,
  WarrantyClaimResult,
} from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

/**
 * Warranty claim queue & fulfillment (E10, docs/14). Reading/approve/reject is
 * WARRANTY_STAFF (support triage). Fulfillment moves money/assets and is
 * narrowed to FINANCE_STAFF; the UI gates it behind a danger-confirm. Every
 * transition is audited by the service.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...WARRANTY_STAFF)
@Controller('admin/warranty-claims')
export class AdminWarrantyController {
  constructor(private readonly warranty: AdminWarrantyService) {}

  @Get()
  async list(
    @Query() query: AdminWarrantyClaimsQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Paginated<AdminWarrantyClaimListItem>> {
    return this.warranty.list(
      query.page,
      query.limit,
      query.status,
      resolveLocale(undefined, acceptLanguage),
    );
  }

  @Get(':id')
  async get(
    @Param('id', uuidParam()) id: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<AdminWarrantyClaimDetail> {
    return this.warranty.get(id, resolveLocale(undefined, acceptLanguage));
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidParam()) id: string,
    @Body() dto: ResolveWarrantyClaimDto,
  ): Promise<WarrantyClaimResult> {
    return this.warranty.approve(user.sub, id, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidParam()) id: string,
    @Body() dto: ResolveWarrantyClaimDto,
  ): Promise<WarrantyClaimResult> {
    return this.warranty.reject(user.sub, id, dto.note);
  }

  @Post(':id/fulfill')
  @HttpCode(200)
  @Roles(...FINANCE_STAFF)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async fulfill(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidParam()) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<WarrantyClaimResult> {
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new ApiException('VALIDATION_ERROR', 'Idempotency-Key header is required', 400, {
        fields: { 'Idempotency-Key': ['required header, at most 255 characters'] },
      });
    }
    return this.warranty.fulfill(user.sub, id, idempotencyKey);
  }
}
