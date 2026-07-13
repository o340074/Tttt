import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { WarmingController } from './warming.controller';
import { WarmingService } from './warming.service';

/**
 * Warming pipeline for MADE_TO_ORDER orders (E6). Exports WarmingService so the
 * checkout flow (OrdersModule) can create a queued job in the payment tx.
 */
@Module({
  imports: [WalletModule], // LedgerService for refunds
  controllers: [WarmingController],
  providers: [WarmingService],
  exports: [WarmingService],
})
export class WarmingModule {}
