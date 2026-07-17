import { Global, Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

/**
 * Referral programme (E12). WalletModule provides the LedgerService used to
 * credit rewards; AuditService and NotificationsService are global. Global so
 * AuthService (attribution on register) and OrdersService (qualification on
 * checkout) can inject the service without an import cycle.
 */
@Global()
@Module({
  imports: [WalletModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
