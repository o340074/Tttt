import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { WarmingModule } from '../warming/warming.module';
import { AdminController } from './admin.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { AdminStockController } from './admin-stock.controller';
import { AdminStockService } from './admin-stock.service';
import { AdminService } from './admin.service';

/**
 * Admin/operator surface (docs/13). E5 covers READY_STOCK import; E8 adds the
 * read views over orders and the stock pool. Warming/inventory operator
 * actions live in their own modules (E6/E7).
 */
@Module({
  imports: [StockModule, WarmingModule],
  controllers: [AdminController, AdminOrdersController, AdminStockController],
  providers: [AdminService, AdminOrdersService, AdminStockService],
})
export class AdminModule {}
