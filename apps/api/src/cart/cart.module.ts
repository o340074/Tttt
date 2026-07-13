import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { PromoService } from './promo.service';

@Module({
  controllers: [CartController],
  providers: [CartService, PromoService],
  exports: [PromoService],
})
export class CartModule {}
