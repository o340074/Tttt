import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CartModule, WalletModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
