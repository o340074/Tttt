import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser, Roles } from '../auth/decorators';
import { FINANCE_STAFF } from '../auth/roles';
import { resolveLocale } from '../catalog/locale';
import { AdminFinanceService } from './admin-finance.service';
import { ManualDeliverDto, RefundDto } from './dto/admin-finance.dto';
import type { AdminOrderDetail, FinanceSummary, RefundResult } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

/**
 * Money-touching / secret-writing order actions and the finance summary
 * (docs/13 §2,§11). Narrowed to managers/admins — the operator/support read
 * surface lives on AdminOrdersController. Every action is audited (E5/E6).
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...FINANCE_STAFF)
@Controller('admin')
export class AdminFinanceController {
  constructor(private readonly finance: AdminFinanceService) {}

  @Post('orders/:id/refund')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async refund(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: RefundDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<RefundResult> {
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new ApiException('VALIDATION_ERROR', 'Idempotency-Key header is required', 400, {
        fields: { 'Idempotency-Key': ['required header, at most 255 characters'] },
      });
    }
    return this.finance.refund(
      user.sub,
      id,
      { orderItemId: dto.orderItemId, reason: dto.reason },
      idempotencyKey,
    );
  }

  @Post('orders/:id/items/:itemId/deliver')
  @HttpCode(200)
  async manualDeliver(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Param('itemId', uuidPipe) itemId: string,
    @Body() dto: ManualDeliverDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<AdminOrderDetail> {
    return this.finance.manualDeliver(
      user.sub,
      id,
      itemId,
      { payload: dto.payload, note: dto.note },
      resolveLocale(undefined, acceptLanguage),
    );
  }

  @Get('finance/summary')
  async summary(): Promise<FinanceSummary> {
    return this.finance.summary();
  }
}
