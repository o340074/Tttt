import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/** Admin/operator surface (docs/13). E5 covers READY_STOCK import; more in E8. */
@Module({
  imports: [StockModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
