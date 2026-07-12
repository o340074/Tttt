import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { TopUpAsset } from '@advault/types';
import type { Env } from '../../config/env';
import type { PaymentIntent, PaymentProvider, TopUpWebhookEvent } from './payment-provider';

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Fake acquirer for development and tests: issues deterministic-looking
 * deposit addresses and verifies webhooks signed with
 * X-Signature = HMAC-SHA256(hex) over the raw body (PAYMENT_WEBHOOK_SECRET).
 * Nothing here talks to a network.
 */
@Injectable()
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox';

  private readonly secret: string;
  private readonly ttlMinutes: number;

  constructor(config: ConfigService<Env, true>) {
    this.secret = config.get('PAYMENT_WEBHOOK_SECRET', { infer: true });
    this.ttlMinutes = config.get('TOPUP_TTL_MINUTES', { infer: true });
  }

  createPayment(input: {
    topUpId: string;
    amount: string;
    asset: TopUpAsset;
  }): Promise<PaymentIntent> {
    const externalId = `sbx_${randomUUID()}`;
    return Promise.resolve({
      externalId,
      address: fakeAddress(input.topUpId, input.asset),
      paymentUrl: `https://pay.sandbox.advault.dev/${externalId}`,
      expiresAt: new Date(Date.now() + this.ttlMinutes * 60_000),
    });
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac('sha256', this.secret).update(rawBody).digest('hex');
    const provided = Buffer.from(signature, 'utf8');
    const wanted = Buffer.from(expected, 'utf8');
    return provided.length === wanted.length && timingSafeEqual(provided, wanted);
  }

  parseWebhook(payload: unknown): TopUpWebhookEvent | null {
    if (typeof payload !== 'object' || payload === null) return null;
    const { externalId, status, fee } = payload as Record<string, unknown>;
    if (typeof externalId !== 'string' || externalId.length === 0) return null;
    if (status !== 'paid' && status !== 'failed') return null;
    if (fee !== undefined && (typeof fee !== 'string' || !MONEY_PATTERN.test(fee))) return null;
    return { externalId, status, ...(fee !== undefined ? { fee } : {}) };
  }
}

/** Plausible-looking deposit address derived from the top-up id (no real chain). */
function fakeAddress(topUpId: string, asset: TopUpAsset): string {
  const seed = createHash('sha256').update(topUpId).digest('hex');
  switch (asset) {
    case 'USDT-TRC20':
      return `T${base62(seed).slice(0, 33)}`;
    case 'BTC':
      return `bc1q${seed.slice(0, 38)}`;
    case 'USDT-ERC20':
    case 'ETH':
      return `0x${seed.slice(0, 40)}`;
  }
}

function base62(hex: string): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = BigInt(`0x${hex}`);
  let out = '';
  while (value > 0n) {
    out += alphabet[Number(value % BigInt(alphabet.length))];
    value /= BigInt(alphabet.length);
  }
  return out;
}
