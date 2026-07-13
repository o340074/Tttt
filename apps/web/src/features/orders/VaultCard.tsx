import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui/Icon';
import { useDelivery } from '../cart/api';
import type { OrderItem } from '@advault/types';

const MASK = '••••••••••••••••';

/**
 * One delivered order item's secret in the Vault: masked until the buyer
 * explicitly reveals it (which fetches + audits it server-side), then copy
 * and download-as-.txt with a micro-flash. Made-to-order lines never render
 * here — only delivered ones do.
 */
export function VaultCard({ orderId, item }: { orderId: string; item: OrderItem }) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState(false);
  const [copied, setCopied] = useState(false);

  const delivery = useDelivery(orderId, item.id, revealed);
  const payload = delivery.data?.payload ?? '';
  const ready = revealed && delivery.isSuccess;

  const pulse = (): void => {
    setFlash(true);
    window.setTimeout(() => setFlash(false), 720);
  };

  const handleCopy = async (): Promise<void> => {
    if (!payload) return;
    try {
      await navigator.clipboard?.writeText(payload);
    } catch {
      // Clipboard may be unavailable (permissions/insecure context) — flash anyway.
    }
    setCopied(true);
    pulse();
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (): void => {
    if (!payload) return;
    const blob = new Blob([`${payload}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `advault-${item.sku}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    pulse();
  };

  return (
    <div
      className={`rounded-lg border border-border bg-surface p-5 shadow-2 ${flash ? 'micro-flash' : ''}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="vault" className="!h-[18px] !w-[18px] text-volt-400" />
          <h3 className="truncate text-[15px] font-bold text-text-hi">{item.name}</h3>
        </div>
        <span className="inline-flex h-6 items-center rounded-pill bg-[rgba(43,217,166,0.14)] px-2.5 text-xs font-semibold text-success">
          {t('vault.delivered')}
        </span>
      </div>

      <div className="mb-1 flex items-center gap-2 text-[12.5px] text-text-lo">
        <span className="uppercase tracking-[0.04em] text-text-dim">{item.sku}</span>
        {item.quantity > 1 && <span>{t('vault.units', { count: item.quantity })}</span>}
      </div>

      <pre
        className={`mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-2 p-3 font-mono text-[13px] ${
          ready ? 'text-text-hi' : 'tracking-[2px] text-text-dim'
        }`}
      >
        {ready ? payload : MASK}
      </pre>

      {revealed && delivery.isError && (
        <p className="mt-2 text-[13px] text-danger" role="alert">
          {t('vault.error')}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!ready ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            disabled={revealed && delivery.isLoading}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-2 bg-surface-2 px-3 text-[13px] font-semibold text-text transition hover:border-volt-400 hover:text-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt disabled:opacity-60"
          >
            <Icon name="eye" className="!h-4 !w-4" />
            {revealed && delivery.isLoading ? t('vault.revealing') : t('vault.show')}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setRevealed(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-2 bg-surface-2 px-3 text-[13px] font-semibold text-text transition hover:border-volt-400 hover:text-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt"
            >
              <Icon name="eye-off" className="!h-4 !w-4" />
              {t('vault.hide')}
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt ${
                copied
                  ? 'border-success text-success'
                  : 'border-border-2 bg-surface-2 text-text hover:border-volt-400 hover:text-text-hi'
              }`}
            >
              <Icon name={copied ? 'check' : 'copy'} className="!h-4 !w-4" />
              {copied ? t('vault.copied') : t('vault.copy')}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-2 bg-surface-2 px-3 text-[13px] font-semibold text-text transition hover:border-volt-400 hover:text-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt"
            >
              <Icon name="download" className="!h-4 !w-4" />
              {t('vault.download')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
