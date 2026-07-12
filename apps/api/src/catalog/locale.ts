import type { Locale } from '@advault/types';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ru'];
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Content locale for a request: explicit ?locale= wins, then the first
 * supported language from Accept-Language, then EN (docs/backend/openapi.md).
 */
export function resolveLocale(query?: string, acceptLanguage?: string): Locale {
  if (query && (SUPPORTED_LOCALES as string[]).includes(query)) return query as Locale;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const lang = (part.split(';')[0] ?? '').trim().toLowerCase().split('-')[0] ?? '';
    if ((SUPPORTED_LOCALES as string[]).includes(lang)) return lang as Locale;
  }
  return DEFAULT_LOCALE;
}

/** Picks a translation row for the locale, falling back to EN, then to any. */
export function pickTranslation<T extends { locale: string }>(
  translations: T[],
  locale: Locale,
): T | undefined {
  return (
    translations.find((t) => t.locale === locale) ??
    translations.find((t) => t.locale === DEFAULT_LOCALE) ??
    translations[0]
  );
}
