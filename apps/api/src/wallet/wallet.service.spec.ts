import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception';
import { makeFakeConfigService, makeFakePrismaService, TEST_ENV } from '../testing/fakes';
import { IdempotencyService } from './idempotency.service';
import { LedgerService } from './ledger.service';
import { SandboxPaymentProvider } from './payments/sandbox.provider';
import { WalletService } from './wallet.service';
import type { TopUp } from '@advault/types';

function sign(payload: unknown): { raw: Buffer; signature: string } {
  const raw = Buffer.from(JSON.stringify(payload));
  const signature = createHmac('sha256', TEST_ENV.PAYMENT_WEBHOOK_SECRET!)
    .update(raw)
    .digest('hex');
  return { raw, signature };
}

describe('WalletService', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let service: WalletService;
  let userId: string;

  const KEY = 'idem-key-1';

  const createTopUp = (amount = '100.00', key = KEY): Promise<TopUp> =>
    service.createTopUp(userId, { amount, asset: 'USDT-TRC20' }, key);

  const paidWebhook = async (externalId: string, fee?: string): Promise<void> => {
    const payload = { externalId, status: 'paid', ...(fee ? { fee } : {}) };
    const { raw, signature } = sign(payload);
    await service.processWebhook('sandbox', raw, signature, payload);
  };

  beforeEach(async () => {
    prisma = makeFakePrismaService();
    const provider = new SandboxPaymentProvider(makeFakeConfigService());
    service = new WalletService(prisma, new LedgerService(), new IdempotencyService(prisma), [
      provider,
    ]);
    const user = await prisma.user.create({
      data: { email: 'wallet@advault.dev', passwordHash: 'x' },
    });
    userId = user.id;
  });

  it('creates a pending top-up with address, paymentUrl and expiry', async () => {
    const topUp = await createTopUp();
    expect(topUp.status).toBe('pending');
    expect(topUp.provider).toBe('sandbox');
    expect(topUp.address).toMatch(/^T/);
    expect(topUp.paymentUrl).toContain('sandbox');
    expect(topUp.expiresAt).not.toBeNull();

    const stored = await prisma.topUp.findUnique({ where: { id: topUp.id } });
    expect(stored!.externalId).toMatch(/^sbx_/);
  });

  it('replays the same response for a repeated Idempotency-Key and 409s on a different body', async () => {
    const first = await createTopUp();
    const replayed = await createTopUp();
    expect(replayed).toEqual(first);
    expect(prisma.topUp.rows).toHaveLength(1);

    const conflict = await createTopUp('55.00').then(
      () => null,
      (e: unknown) => e,
    );
    expect(conflict).toBeInstanceOf(ApiException);
    expect((conflict as ApiException).code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects out-of-range amounts', async () => {
    await expect(createTopUp('0.50')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(createTopUp('100001.00')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('credits the balance once for a paid webhook and stays idempotent on replays', async () => {
    const topUp = await createTopUp('120.00');
    const externalId = prisma.topUp.rows[0]!.externalId!;

    await paidWebhook(externalId, '1.20');
    let wallet = await service.getWallet(userId);
    expect(wallet.balance).toBe('120.00');
    expect(wallet.recent).toHaveLength(1);
    expect(wallet.recent[0]).toMatchObject({
      direction: 'credit',
      amount: '120.00',
      balanceAfter: '120.00',
      refType: 'topup',
      refId: topUp.id,
    });

    // Replay: no double credit, no extra ledger rows.
    await paidWebhook(externalId);
    await paidWebhook(externalId);
    wallet = await service.getWallet(userId);
    expect(wallet.balance).toBe('120.00');
    expect(prisma.ledgerEntry.rows).toHaveLength(1);

    const stored = await service.getTopUp(userId, topUp.id);
    expect(stored.status).toBe('paid');
    expect(stored.paidAt).not.toBeNull();
    expect(prisma.topUp.rows[0]!.fee!.toFixed(2)).toBe('1.20');
  });

  it('keeps balanceAfter converging across several credited top-ups', async () => {
    await createTopUp('10.00', 'k1');
    await createTopUp('2.50', 'k2');
    for (const row of prisma.topUp.rows) await paidWebhook(row.externalId!);

    const wallet = await service.getWallet(userId);
    expect(wallet.balance).toBe('12.50');
    const last = prisma.ledgerEntry.rows.at(-1)!;
    expect(last.balanceAfter.toFixed(2)).toBe('12.50');

    const transactions = await service.listTransactions(userId, 1, 10);
    expect(transactions.meta.total).toBe(2);
    expect(transactions.data[0]!.balanceAfter).toBe('12.50');
  });

  it('rejects a webhook with a bad signature and a malformed payload', async () => {
    const payload = { externalId: 'sbx_x', status: 'paid' };
    await expect(
      service.processWebhook('sandbox', Buffer.from(JSON.stringify(payload)), 'bad', payload),
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });

    const malformed = { nope: true };
    const { raw, signature } = sign(malformed);
    await expect(
      service.processWebhook('sandbox', raw, signature, malformed),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const { raw: raw2, signature: sig2 } = sign(payload);
    await expect(service.processWebhook('nope', raw2, sig2, payload)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('acknowledges webhooks for unknown externalId without crediting anyone', async () => {
    const payload = { externalId: 'sbx_foreign', status: 'paid' };
    const { raw, signature } = sign(payload);
    await expect(service.processWebhook('sandbox', raw, signature, payload)).resolves.toEqual({
      received: true,
    });
    expect(prisma.ledgerEntry.rows).toHaveLength(0);
  });

  it('marks overdue pending top-ups as expired (sweep + lazy read) but still credits late payments', async () => {
    const topUp = await createTopUp('30.00');
    await prisma.topUp.update({
      where: { id: topUp.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await service.expireOverduePending()).toBe(1);
    expect((await service.getTopUp(userId, topUp.id)).status).toBe('expired');

    // The user paid anyway — funds arrived, so the credit still lands.
    await paidWebhook(prisma.topUp.rows[0]!.externalId!);
    expect((await service.getTopUp(userId, topUp.id)).status).toBe('paid');
    expect((await service.getWallet(userId)).balance).toBe('30.00');
  });

  it('marks a pending top-up failed on a failed webhook without touching the balance', async () => {
    const topUp = await createTopUp('40.00');
    const payload = { externalId: prisma.topUp.rows[0]!.externalId!, status: 'failed' };
    const { raw, signature } = sign(payload);
    await service.processWebhook('sandbox', raw, signature, payload);

    expect((await service.getTopUp(userId, topUp.id)).status).toBe('failed');
    expect((await service.getWallet(userId)).balance).toBe('0.00');
  });

  it('hides foreign top-ups (404 for another user)', async () => {
    const topUp = await createTopUp();
    const other = await prisma.user.create({
      data: { email: 'other@advault.dev', passwordHash: 'x' },
    });
    await expect(service.getTopUp(other.id, topUp.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
