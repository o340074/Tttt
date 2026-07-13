import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser } from '../auth/decorators';
import { CheckoutDto } from '../cart/dto/cart.dto';
import { resolveLocale } from '../catalog/locale';
import { OrdersQueryDto } from './dto/orders.dto';
import { OrdersService } from './orders.service';
import type { Order, Paginated } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('checkout')
  @HttpCode(201)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async checkout(
    @CurrentUser() user: AccessPayload,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Order> {
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new ApiException('VALIDATION_ERROR', 'Idempotency-Key header is required', 400, {
        fields: { 'Idempotency-Key': ['required header, at most 255 characters'] },
      });
    }
    return this.orders.checkout(
      user.sub,
      dto,
      idempotencyKey,
      resolveLocale(undefined, acceptLanguage),
    );
  }

  @Get()
  async listOrders(
    @CurrentUser() user: AccessPayload,
    @Query() query: OrdersQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Paginated<Order>> {
    return this.orders.listOrders(
      user.sub,
      query.page,
      query.limit,
      resolveLocale(query.locale, acceptLanguage),
    );
  }

  @Get(':id')
  async getOrder(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Query() query: OrdersQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Order> {
    return this.orders.getOrder(user.sub, id, resolveLocale(query.locale, acceptLanguage));
  }
}
