import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser, Roles } from '../auth/decorators';
import { FINANCE_STAFF } from '../auth/roles';
import { AdminPromoService } from './admin-promo.service';
import { CreatePromoCodeDto, UpdatePromoCodeDto } from './dto/admin-promo.dto';
import type { AdminPromoCode } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

/**
 * Promo-code CRUD (docs/13 §12). Managers/admins only (finance surface).
 * Redemption stays in checkout (E4); every mutation is audited.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...FINANCE_STAFF)
@Controller('admin/promo-codes')
export class AdminPromoController {
  constructor(private readonly promo: AdminPromoService) {}

  @Get()
  async list(): Promise<AdminPromoCode[]> {
    return this.promo.list();
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() actor: AccessPayload,
    @Body() dto: CreatePromoCodeDto,
  ): Promise<AdminPromoCode> {
    return this.promo.create(actor.sub, {
      code: dto.code,
      type: dto.type,
      value: dto.value,
      maxUses: dto.maxUses,
      expiresAt: dto.expiresAt,
    });
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdatePromoCodeDto,
  ): Promise<AdminPromoCode> {
    return this.promo.update(actor.sub, id, {
      type: dto.type,
      value: dto.value,
      maxUses: dto.maxUses,
      expiresAt: dto.expiresAt,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) id: string,
  ): Promise<void> {
    await this.promo.remove(actor.sub, id);
  }
}
