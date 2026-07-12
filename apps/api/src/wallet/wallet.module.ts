import { Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { LedgerService } from './ledger.service';
import { PAYMENT_PROVIDERS } from './payments/payment-provider';
import { SandboxPaymentProvider } from './payments/sandbox.provider';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WebhooksController } from './webhooks.controller';
import type { PaymentProvider } from './payments/payment-provider';

@Module({
  controllers: [WalletController, WebhooksController],
  providers: [
    WalletService,
    LedgerService,
    IdempotencyService,
    SandboxPaymentProvider,
    {
      // Registered providers; the first is the default for new top-ups.
      provide: PAYMENT_PROVIDERS,
      useFactory: (sandbox: SandboxPaymentProvider): PaymentProvider[] => [sandbox],
      inject: [SandboxPaymentProvider],
    },
  ],
  exports: [LedgerService],
})
export class WalletModule {}
