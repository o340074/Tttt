import { Body, Controller, Get, Param, Patch, Query, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators';
import { SUPPORT_STAFF } from '../auth/roles';
import { resolveLocale } from '../catalog/locale';
import { uuidParam } from '../common/uuid-param';
import { AdminReviewsService } from './admin-reviews.service';
import { AdminReviewsQueryDto, ModerateReviewDto } from './dto/admin-reviews.dto';
import type { AdminReviewListItem, Paginated } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

/**
 * Review moderation queue (E11, docs/13). SUPPORT_STAFF can list reviews and
 * hide/restore an abusive one; the service recomputes the product rating and
 * audits every action.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...SUPPORT_STAFF)
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: AdminReviewsService) {}

  @Get()
  async list(
    @Query() query: AdminReviewsQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Paginated<AdminReviewListItem>> {
    return this.reviews.list(
      query.page,
      query.limit,
      query.hidden,
      resolveLocale(undefined, acceptLanguage),
    );
  }

  @Patch(':id')
  async moderate(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidParam()) id: string,
    @Body() dto: ModerateReviewDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<AdminReviewListItem> {
    return this.reviews.moderate(
      user.sub,
      id,
      dto.hidden,
      resolveLocale(undefined, acceptLanguage),
    );
  }
}
