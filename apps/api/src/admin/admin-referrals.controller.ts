import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators';
import { REPORTS_STAFF } from '../auth/roles';
import { uuidParam } from '../common/uuid-param';
import { AdminReferralsService } from './admin-referrals.service';
import { AdminReferralsQueryDto, CancelReferralDto } from './dto/admin-referrals.dto';
import type { AdminReferral, AdminReferralList } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

/**
 * Referral oversight queue (E12, docs/13). Managers/admins only (analytics /
 * money surface). Listing carries programme-wide totals; cancelling is limited
 * to pending referrals and audited.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...REPORTS_STAFF)
@Controller('admin/referrals')
export class AdminReferralsController {
  constructor(private readonly referrals: AdminReferralsService) {}

  @Get()
  async list(@Query() query: AdminReferralsQueryDto): Promise<AdminReferralList> {
    return this.referrals.list(query.page, query.limit, query.status);
  }

  @Patch(':id/cancel')
  async cancel(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidParam()) id: string,
    @Body() dto: CancelReferralDto,
  ): Promise<AdminReferral> {
    return this.referrals.cancel(user.sub, id, dto.reason);
  }
}
