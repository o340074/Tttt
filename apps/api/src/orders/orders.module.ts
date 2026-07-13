import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { StockModule } from '../stock/stock.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CartModule, WalletModule, StockModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
