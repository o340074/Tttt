import type { TFunction } from 'i18next';

/** "42.00" + "USD" → "$42.00" (other currencies fall back to "42.00 XXX"). */
export function formatMoney(amount: string, currency: string): string {
  return currency === 'USD' ? `$${amount}` : `${amount} ${currency}`;
}

/** ETA minutes → human estimate: days when ≥ 1 day, hours when ≥ 1 hour, else minutes. */
export function formatEta(t: TFunction, minutes: number): string {
  if (minutes >= 24 * 60) return t('product.etaDays', { count: Math.round(minutes / (24 * 60)) });
  if (minutes >= 60) return t('product.etaHours', { count: Math.round(minutes / 60) });
  return t('product.etaMinutes', { count: minutes });
}

/** Feature-glyph id for a product/category; attributes.icon wins, slug map as fallback. */
export function catalogIcon(attributes: Record<string, unknown> | undefined, slug: string): string {
  const fromAttrs = attributes?.icon;
  if (typeof fromAttrs === 'string' && fromAttrs) return fromAttrs;
  const bySlug: Record<string, string> = {
    'google-ads': 'ads',
    'google-ads-agency': 'briefcase',
    'developer-accounts': 'verify',
    'aged-accounts': 'clock',
    proxies: 'globe',
    antidetect: 'box',
  };
  return bySlug[slug] ?? 'box';
}
