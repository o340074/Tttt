import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser } from '../auth/decorators';
import { LocaleQueryDto } from '../catalog/dto/catalog.dto';
import { resolveLocale } from '../catalog/locale';
import { CartService } from './cart.service';
import { PromoService } from './promo.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';
import type { Cart, PromoCodePublic } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

@ApiTags('Cart')
@ApiBearerAuth()
@Controller()
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly promo: PromoService,
  ) {}

  @Get('cart')
  async getCart(
    @CurrentUser() user: AccessPayload,
    @Query() query: LocaleQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Cart> {
    return this.cart.getCart(user.sub, resolveLocale(query.locale, acceptLanguage));
  }

  @Post('cart/items')
  @HttpCode(201)
  async addItem(
    @CurrentUser() user: AccessPayload,
    @Body() dto: AddCartItemDto,
    @Query() query: LocaleQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Cart> {
    return this.cart.addItem(
      user.sub,
      dto.variantId,
      dto.quantity,
      resolveLocale(query.locale, acceptLanguage),
    );
  }

  @Patch('cart/items/:id')
  async updateItem(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateCartItemDto,
    @Query() query: LocaleQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Cart> {
    return this.cart.updateItem(
      user.sub,
      id,
      dto.quantity,
      resolveLocale(query.locale, acceptLanguage),
    );
  }

  @Delete('cart/items/:id')
  async removeItem(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Query() query: LocaleQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Cart> {
    return this.cart.removeItem(user.sub, id, resolveLocale(query.locale, acceptLanguage));
  }

  /** Discount preview for the cart; the final validation happens at checkout. */
  @Get('promo-codes/:code')
  async getPromoCode(@Param('code') code: string): Promise<PromoCodePublic> {
    const promo = await this.promo.findValid(code);
    if (!promo) {
      throw new ApiException('PROMO_INVALID', 'Promo code is invalid or expired', 404);
    }
    return { code: promo.code, type: promo.type, value: promo.value.toFixed(2) };
  }
}
