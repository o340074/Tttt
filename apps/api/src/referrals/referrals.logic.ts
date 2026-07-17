import { randomInt } from 'node:crypto';

/**
 * Pure helpers for the referral programme (E12). No DB, no framework — trivially
 * unit-testable: code minting, invite-link building and email masking.
 */

/** Unambiguous alphabet for shareable codes (no 0/O/1/I to avoid transcription errors). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Mint a human-shareable code, e.g. "AV-7QK4ZP". Collisions are retried by the caller. */
export function generateReferralCode(): string {
  let body = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    body += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return `AV-${body}`;
}

/** Normalize a user-supplied code: trim + uppercase so links are case-insensitive. */
export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Build the absolute invite URL from the web base and a code (no trailing-slash surprises). */
export function buildInviteLink(webUrl: string, code: string): string {
  return `${webUrl.replace(/\/+$/, '')}/auth/register?ref=${encodeURIComponent(code)}`;
}

/**
 * Mask an email for display to the referrer (privacy — never expose a referee's
 * full address): keep the first character and the domain, e.g.
 * "alice@example.com" → "a•••@example.com". Degrades gracefully on odd input.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '•••';
  const first = email[0]!;
  const domain = email.slice(at);
  return `${first}•••${domain}`;
}
