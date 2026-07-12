import { ApiRequestError } from '../../lib/api';

const KNOWN_CODES = new Set([
  'INVALID_CREDENTIALS',
  'EMAIL_ALREADY_USED',
  'RATE_LIMITED',
  'INVALID_TOKEN',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
]);

/** Maps an API error to an i18n key (errors.* in the locale files). */
export function errorKey(error: unknown): string {
  if (error instanceof ApiRequestError && KNOWN_CODES.has(error.code)) {
    return `errors.${error.code}`;
  }
  return 'errors.GENERIC';
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
