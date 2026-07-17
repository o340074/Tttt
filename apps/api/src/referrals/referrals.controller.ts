import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import { ReferralsService } from './referrals.service';
import type { AccessPayload } from '../auth/token.service';
import type { MyReferral } from '@advault/types';

/**
 * Buyer-facing referral surface (E12). The invite code is minted lazily on first
 * view; the response carries the shareable link, reward terms and the user's own
 * referral list (referee emails masked).
 */
@ApiTags('Referrals')
@ApiBearerAuth()
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get('me')
  async me(@CurrentUser() user: AccessPayload): Promise<MyReferral> {
    return this.referrals.getMyReferral(user.sub);
  }
}
