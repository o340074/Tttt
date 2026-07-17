import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StockModule } from '../stock/stock.module';
import { WalletModule } from '../wallet/wallet.module';
import { WarmingModule } from '../warming/warming.module';
import { AdminController } from './admin.controller';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { AdminPlansController } from './admin-plans.controller';
import { AdminPlansService } from './admin-plans.service';
import { AdminPromoController } from './admin-promo.controller';
import { AdminPromoService } from './admin-promo.service';
import { AdminReferralsController } from './admin-referrals.controller';
import { AdminReferralsService } from './admin-referrals.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { AdminReviewsController } from './admin-reviews.controller';
import { AdminReviewsService } from './admin-reviews.service';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';
import { AdminStaffController } from './admin-staff.controller';
import { AdminStaffService } from './admin-staff.service';
import { AdminStockController } from './admin-stock.controller';
import { AdminStockService } from './admin-stock.service';
import { AdminTicketsController } from './admin-tickets.controller';
import { AdminTicketsService } from './admin-tickets.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminWarrantyController } from './admin-warranty.controller';
import { AdminWarrantyService } from './admin-warranty.service';
import { AdminService } from './admin.service';

/**
 * Admin/operator surface (docs/13). E5 covers READY_STOCK import; E8 adds the
 * read views over orders and the stock pool, plus finance actions (manual
 * refund/delivery + ledger reconciliation), customer management and promo CRUD.
 * Warming/inventory operator actions live in their own modules (E6/E7).
 * WalletModule provides the ledger + idempotency; AuthModule provides
 * TokenService for revoking sessions when a user is blocked / re-roled.
 */
@Module({
  imports: [StockModule, WarmingModule, WalletModule, AuthModule],
  controllers: [
    AdminController,
    AdminOrdersController,
    AdminStockController,
    AdminFinanceController,
    AdminUsersController,
    AdminPromoController,
    AdminCatalogController,
    AdminPlansController,
    AdminTicketsController,
    AdminReportsController,
    AdminStaffController,
    AdminSettingsController,
    AdminWarrantyController,
    AdminReviewsController,
    AdminReferralsController,
  ],
  providers: [
    AdminService,
    AdminOrdersService,
    AdminStockService,
    AdminFinanceService,
    AdminUsersService,
    AdminPromoService,
    AdminCatalogService,
    AdminPlansService,
    AdminTicketsService,
    AdminReportsService,
    AdminStaffService,
    AdminSettingsService,
    AdminWarrantyService,
    AdminReviewsService,
    AdminReferralsService,
  ],
})
export class AdminModule {}
