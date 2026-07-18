import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import { resolveLocale } from '../catalog/locale';
import { uuidParam } from '../common/uuid-param';
import { CreateWarrantyClaimDto, MyWarrantyClaimsQueryDto } from './dto/warranty.dto';
import { WarrantyService } from './warranty.service';
import type { Paginated, WarrantyClaimView } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

/**
 * Buyer warranty portal (E10). Every route is scoped to `CurrentUser`: a buyer
 * only ever opens or reads claims on their own delivered lines.
 */
@ApiTags('Warranty')
@ApiBearerAuth()
@Controller('warranty-claims')
export class WarrantyController {
  constructor(private readonly warranty: WarrantyService) {}

  @Get()
  async list(
    @CurrentUser() user: AccessPayload,
    @Query() query: MyWarrantyClaimsQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Paginated<WarrantyClaimView>> {
    return this.warranty.list(
      user.sub,
      query.page,
      query.limit,
      resolveLocale(undefined, acceptLanguage),
    );
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AccessPayload,
    @Body() dto: CreateWarrantyClaimDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<WarrantyClaimView> {
    return this.warranty.create(user.sub, dto, resolveLocale(undefined, acceptLanguage));
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidParam()) id: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<WarrantyClaimView> {
    return this.warranty.get(user.sub, id, resolveLocale(undefined, acceptLanguage));
  }
}
