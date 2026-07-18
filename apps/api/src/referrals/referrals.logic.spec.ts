import { describe, expect, it } from 'vitest';
import {
  buildInviteLink,
  generateReferralCode,
  maskEmail,
  normalizeReferralCode,
} from './referrals.logic';

describe('referrals.logic', () => {
  it('generates AV-prefixed codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateReferralCode();
      expect(code).toMatch(/^AV-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it('normalizes a code by trimming and upper-casing', () => {
    expect(normalizeReferralCode('  av-7qk4zp ')).toBe('AV-7QK4ZP');
  });

  it('builds an invite link without double slashes and with an encoded code', () => {
    expect(buildInviteLink('http://localhost:5173/', 'AV-7QK4ZP')).toBe(
      'http://localhost:5173/auth/register?ref=AV-7QK4ZP',
    );
  });

  it('masks an email keeping the first character and the domain', () => {
    expect(maskEmail('alice@example.com')).toBe('a•••@example.com');
    expect(maskEmail('b@x.io')).toBe('b•••@x.io');
    expect(maskEmail('nonsense')).toBe('•••');
  });
});
