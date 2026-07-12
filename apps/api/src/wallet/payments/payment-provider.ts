import type { TopUpAsset } from '@advault/types';

/** What the acquirer returns when a payment is created. */
export interface PaymentIntent {
  externalId: string;
  address: string;
  paymentUrl: string;
  expiresAt: Date;
}

/** Provider webhook normalized to what the wallet needs. */
export interface TopUpWebhookEvent {
  externalId: string;
  status: 'paid' | 'failed';
  /** Acquirer fee in the accounting currency, if reported (Money string). */
  fee?: string;
}

/**
 * Crypto-acquiring behind an interface (docs/08). E3 ships the sandbox
 * implementation; a real provider (Cryptomus/NOWPayments/…) plugs in later
 * as another named implementation without touching the wallet.
 */
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: {
    topUpId: string;
    amount: string;
    asset: TopUpAsset;
  }): Promise<PaymentIntent>;
  /** Verify webhook authenticity against the raw request body. */
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
  /** Normalize the provider payload; null when malformed. */
  parseWebhook(payload: unknown): TopUpWebhookEvent | null;
}

/** DI token: the list of registered payment providers (first one is default). */
export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
