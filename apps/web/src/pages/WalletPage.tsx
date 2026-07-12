import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { useAuth } from '../features/auth/useAuth';
import { errorKey } from '../features/auth/errors';
import {
  useCreateTopUp,
  useInvalidateWallet,
  useTopUpStatus,
  useTransactions,
  useWallet,
} from '../features/wallet/api';
import { apiFetch } from '../lib/api';
import type { LedgerEntry, TopUp, TopUpAsset, User } from '@advault/types';

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const AMOUNT_MIN = 1;
const AMOUNT_MAX = 100_000;

const ASSETS: { value: TopUpAsset; label: string; network: string | null }[] = [
  { value: 'USDT-TRC20', label: 'USDT', network: 'TRC-20' },
  { value: 'USDT-ERC20', label: 'USDT', network: 'ERC-20' },
  { value: 'BTC', label: 'BTC', network: null },
  { value: 'ETH', label: 'ETH', network: null },
];

/** Wallet screen (prototype/index.html → #s-wallet): balance, top-up, history. */
export function WalletPage() {
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const wallet = useWallet();
  const invalidateWallet = useInvalidateWallet();

  const [activeTopUp, setActiveTopUp] = useState<TopUp | null>(null);
  const polled = useTopUpStatus(activeTopUp?.id ?? null);
  const topUp = polled.data ?? activeTopUp;

  const [flash, setFlash] = useState(false);
  const creditedRef = useRef<string | null>(null);

  // When the poll reports the credit landed: flash, refresh balance + profile.
  useEffect(() => {
    if (!topUp || topUp.status !== 'paid' || creditedRef.current === topUp.id) return;
    creditedRef.current = topUp.id;
    setFlash(true);
    invalidateWallet();
    apiFetch<User>('/me')
      .then(setUser)
      .catch(() => undefined);
    const timer = setTimeout(() => setFlash(false), 800);
    return () => clearTimeout(timer);
  }, [topUp, invalidateWallet, setUser]);

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-10 md:px-6">
      {flash && <div className="flash-success" aria-hidden />}

      <h1 className="mb-6 text-2xl font-bold md:text-3xl">{t('wallet.title')}</h1>

      <div className="grid items-start gap-6 md:grid-cols-2">
        <BalanceCard />
        <section className="rounded-xl border border-border bg-surface p-6 shadow-2">
          <h2 className="mb-5 text-lg font-semibold">{t('wallet.topup.title')}</h2>
          {topUp ? (
            <TopUpPanel topUp={topUp} onReset={() => setActiveTopUp(null)} />
          ) : (
            <TopUpForm onCreated={setActiveTopUp} />
          )}
        </section>
      </div>

      <History />
      {wallet.isError && <span className="sr-only">{t(errorKey(wallet.error))}</span>}
    </div>
  );
}

function BalanceCard() {
  const { t, i18n } = useTranslation();
  const wallet = useWallet();

  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-surface p-7 shadow-2">
      <div className="aurora-mini" aria-hidden />
      <div className="relative z-[1]">
        <div className="mb-1.5 flex items-center gap-2 text-sm text-text-lo">
          <Icon name="wallet" className="text-[15px]" />
          {t('wallet.balanceTitle')}
        </div>
        {wallet.isLoading ? (
          <div className="h-[52px] w-48 animate-pulse rounded-md bg-surface-2" />
        ) : wallet.isError ? (
          <Banner tone="error">{t(errorKey(wallet.error))}</Banner>
        ) : (
          <>
            <div className="font-display text-[46px] font-extrabold tabular-nums leading-tight tracking-tight text-text-hi">
              ${wallet.data!.balance}
            </div>
            <div className="mt-2 text-[13px] text-text-dim">
              {t('wallet.balanceHint', {
                amount: Number(wallet.data!.balance).toLocaleString(i18n.resolvedLanguage),
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function TopUpForm({ onCreated }: { onCreated: (topUp: TopUp) => void }) {
  const { t } = useTranslation();
  const createTopUp = useCreateTopUp();

  const [amount, setAmount] = useState('100');
  const [asset, setAsset] = useState<TopUpAsset>('USDT-TRC20');
  const [amountError, setAmountError] = useState<string | null>(null);
  // One idempotency key per logical top-up: retries after an error reuse it,
  // editing the form starts a fresh operation.
  const keyRef = useRef<string | null>(null);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const value = amount.trim();
    if (!MONEY_PATTERN.test(value) || Number(value) < AMOUNT_MIN || Number(value) > AMOUNT_MAX) {
      setAmountError(t('wallet.topup.amountError', { min: AMOUNT_MIN, max: AMOUNT_MAX }));
      return;
    }
    setAmountError(null);
    keyRef.current ??= crypto.randomUUID();
    createTopUp.mutate(
      { body: { amount: Number(value).toFixed(2), asset }, idempotencyKey: keyRef.current },
      {
        onSuccess: (topUp) => {
          keyRef.current = null;
          createTopUp.reset();
          onCreated(topUp);
        },
      },
    );
  };

  const onFieldChange = (): void => {
    keyRef.current = null;
    if (createTopUp.isError) createTopUp.reset();
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="mb-4">
        <label
          htmlFor="topup-amount"
          className="mb-1.5 block text-[13px] font-semibold text-text-lo"
        >
          {t('wallet.topup.amount')}
        </label>
        <input
          id="topup-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            onFieldChange();
          }}
          aria-invalid={amountError ? true : undefined}
          aria-describedby={amountError ? 'topup-amount-error' : undefined}
          className="h-[46px] w-full rounded-md border border-border bg-surface-2 px-3.5 text-base text-text-hi transition-[border-color,box-shadow] duration-[140ms] focus:border-volt focus:shadow-glow-volt focus:outline-none"
        />
        {amountError && (
          <p id="topup-amount-error" className="mt-1.5 text-[12.5px] text-danger">
            {amountError}
          </p>
        )}
      </div>

      <fieldset className="mb-5">
        <legend className="mb-1.5 block text-[13px] font-semibold text-text-lo">
          {t('wallet.topup.asset')}
        </legend>
        <div className="flex gap-2">
          {ASSETS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setAsset(option.value);
                onFieldChange();
              }}
              aria-pressed={asset === option.value}
              className={`flex-1 rounded-md border px-2 py-2.5 text-center text-[13px] font-semibold transition-all duration-[140ms] ${
                asset === option.value
                  ? 'border-beam bg-[rgba(34,211,238,0.12)] text-beam shadow-glow-beam'
                  : 'border-border-2 bg-surface-2 text-text hover:text-text-hi'
              }`}
            >
              {option.label}
              {option.network && (
                <>
                  <br />
                  <small className="font-normal text-text-dim">{option.network}</small>
                </>
              )}
            </button>
          ))}
        </div>
      </fieldset>

      {createTopUp.isError && <Banner tone="error">{t(errorKey(createTopUp.error))}</Banner>}

      <Button type="submit" block loading={createTopUp.isPending}>
        <Icon name="bolt" className="text-[14px]" /> {t('wallet.topup.submit')}
      </Button>
    </form>
  );
}

function TopUpPanel({ topUp, onReset }: { topUp: TopUp; onReset: () => void }) {
  const { t } = useTranslation();

  if (topUp.status === 'paid') {
    return (
      <div className="fade-up text-center" role="status">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-pill bg-[rgba(43,217,166,0.15)] text-success">
          <Icon name="check" className="text-[24px]" />
        </span>
        <h3 className="mb-1 text-lg font-semibold text-text-hi">{t('wallet.topup.paidTitle')}</h3>
        <p className="mb-5 text-sm text-text-lo">
          {t('wallet.topup.paidText', { amount: topUp.amount })}
        </p>
        <Button variant="secondary" onClick={onReset}>
          {t('wallet.topup.again')}
        </Button>
      </div>
    );
  }

  if (topUp.status === 'expired' || topUp.status === 'failed') {
    return (
      <div className="fade-up text-center" role="status">
        <Banner tone={topUp.status === 'failed' ? 'error' : 'info'}>
          {t(`wallet.topup.${topUp.status}`)}
        </Banner>
        <Button variant="secondary" onClick={onReset}>
          {t('wallet.topup.newPayment')}
        </Button>
      </div>
    );
  }

  return <PendingPayment topUp={topUp} onReset={onReset} />;
}

function PendingPayment({ topUp, onReset }: { topUp: TopUp; onReset: () => void }) {
  const { t } = useTranslation();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!topUp.address) return;
    QRCode.toDataURL(topUp.address, { margin: 1, width: 300 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [topUp.address]);

  const copyAddress = async (): Promise<void> => {
    if (!topUp.address) return;
    try {
      await navigator.clipboard.writeText(topUp.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be unavailable — the address stays selectable as text.
    }
  };

  const assetLabel = ASSETS.find((a) => a.value === topUp.asset);

  return (
    <div className="fade-up text-center">
      {qr && (
        <img
          src={qr}
          alt={t('wallet.topup.qrAlt')}
          className="mx-auto mb-4 h-[150px] w-[150px] rounded-md border-8 border-white"
        />
      )}
      <p className="mb-2 text-[13px] text-text-lo">
        {t('wallet.topup.sendExactly')}{' '}
        <b className="text-text-hi">
          {topUp.amount} {assetLabel?.label ?? topUp.asset}
          {assetLabel?.network ? ` (${assetLabel.network})` : ''}
        </b>
      </p>
      <div className="break-all rounded-md border border-border bg-surface-2 p-3 text-center font-mono text-[12.5px] text-text">
        {topUp.address}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => void copyAddress()}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-sm border border-border-2 bg-surface-2 px-2.5 text-[12.5px] font-semibold text-text transition-colors duration-[140ms] hover:border-volt hover:text-text-hi"
        >
          <Icon name={copied ? 'check' : 'copy'} className="text-[12px]" />
          {copied ? t('wallet.topup.copied') : t('wallet.topup.copy')}
        </button>
        {topUp.expiresAt && <Countdown until={topUp.expiresAt} />}
      </div>
      <div className="mt-4 flex items-center justify-center gap-2 text-[13px] text-text-lo">
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-pill border-2 border-volt/30 border-t-volt"
        />
        {t('wallet.topup.waiting')}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 text-[12.5px] font-semibold text-text-dim underline-offset-2 hover:text-text-hi hover:underline"
      >
        {t('wallet.topup.cancel')}
      </button>
    </div>
  );
}

function Countdown({ until }: { until: string }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');

  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] tabular-nums text-text-lo">
      <Icon name="clock" className="text-[12px]" />
      {t('wallet.topup.expiresIn')}{' '}
      <b className="text-text-hi">
        {minutes}:{seconds}
      </b>
    </span>
  );
}

function History() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const limit = 10;
  const transactions = useTransactions(page, limit);
  const totalPages = transactions.data
    ? Math.max(1, Math.ceil(transactions.data.meta.total / limit))
    : 1;

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-lg font-semibold">{t('wallet.history.title')}</h2>

      {transactions.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-surface-2" />
          ))}
        </div>
      ) : transactions.isError ? (
        <Banner tone="error">{t(errorKey(transactions.error))}</Banner>
      ) : transactions.data!.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center text-text-lo">
          <Icon name="wallet" className="mb-3 text-[40px] opacity-70" />
          <p>{t('wallet.history.empty')}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b border-border px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-[0.05em] text-text-dim">
                    {t('wallet.history.date')}
                  </th>
                  <th className="border-b border-border px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-[0.05em] text-text-dim">
                    {t('wallet.history.type')}
                  </th>
                  <th className="border-b border-border px-3.5 py-3 text-right text-xs font-semibold uppercase tracking-[0.05em] text-text-dim">
                    {t('wallet.history.amount')}
                  </th>
                  <th className="border-b border-border px-3.5 py-3 text-right text-xs font-semibold uppercase tracking-[0.05em] text-text-dim">
                    {t('wallet.history.balanceAfter')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.data!.data.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} locale={i18n.resolvedLanguage ?? 'en'} />
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav
              className="mt-4 flex items-center justify-center gap-3"
              aria-label={t('wallet.history.pagination')}
            >
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="arrow-left" className="text-[12px]" /> {t('wallet.history.prev')}
              </Button>
              <span className="text-[13px] tabular-nums text-text-lo">
                {t('wallet.history.page', { page, total: totalPages })}
              </span>
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('wallet.history.next')} <Icon name="arrow-right" className="text-[12px]" />
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

function HistoryRow({ entry, locale }: { entry: LedgerEntry; locale: string }) {
  const { t } = useTranslation();
  const credit = entry.direction === 'credit';

  return (
    <tr className="transition-colors duration-[140ms] hover:bg-surface-2">
      <td className="border-b border-border px-3.5 py-3 tabular-nums text-text-lo">
        {new Date(entry.createdAt).toLocaleString(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </td>
      <td className="border-b border-border px-3.5 py-3 text-text">
        {t(`wallet.refType.${entry.refType}`)}
      </td>
      <td
        className={`border-b border-border px-3.5 py-3 text-right font-mono tabular-nums ${
          credit ? 'text-success' : 'text-danger'
        }`}
      >
        {credit ? '+' : '−'}${entry.amount}
      </td>
      <td className="border-b border-border px-3.5 py-3 text-right font-mono tabular-nums text-text-hi">
        ${entry.balanceAfter}
      </td>
    </tr>
  );
}
