import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { WalletModule } from '../wallet/wallet.module';
import { WarmingController } from './warming.controller';
import { WarmingService } from './warming.service';

/**
 * Warming pipeline for MADE_TO_ORDER orders (E6). Exports WarmingService so the
 * checkout flow (OrdersModule) can create a queued job in the payment tx.
 * Imports InventoryModule (E7) so the operator job detail can list the proxy /
 * Octo resources bound to a job.
 */
@Module({
  imports: [WalletModule, InventoryModule], // LedgerService for refunds; InventoryService for bound resources
  controllers: [WarmingController],
  providers: [WarmingService],
  exports: [WarmingService],
})
export class WarmingModule {}
