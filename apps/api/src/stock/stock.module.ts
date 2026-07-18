import { Module } from '@nestjs/common';
import { StockService } from './stock.service';

/** READY_STOCK inventory: reserve/sell during checkout, admin import. */
@Module({
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
