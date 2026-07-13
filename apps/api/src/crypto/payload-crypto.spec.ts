import { describe, expect, it } from 'vitest';
import { decryptPayload, encryptPayload, hashPayload, parseKeyRing } from './payload-crypto';

const KEY_A = Buffer.from('a'.repeat(32), 'utf8').toString('base64');
const KEY_B = Buffer.from('b'.repeat(32), 'utf8').toString('base64');

describe('payload-crypto', () => {
  it('round-trips utf8 payloads', () => {
    const ring = parseKeyRing(`v1:${KEY_A}`);
    const secret = 'ads_us_9f3@mailbox.io:Xf7$kLp2!qWz:recovery@proton.me · пароль';
    const stored = encryptPayload(ring, secret);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain('mailbox.io');
    expect(decryptPayload(ring, stored)).toBe(secret);
  });

  it('produces a fresh IV per encryption (same plaintext, different ciphertext)', () => {
    const ring = parseKeyRing(`v1:${KEY_A}`);
    expect(encryptPayload(ring, 'same')).not.toBe(encryptPayload(ring, 'same'));
  });

  it('encrypts with the first key but still decrypts older versions', () => {
    const oldRing = parseKeyRing(`v1:${KEY_A}`);
    const legacy = encryptPayload(oldRing, 'legacy-secret');

    const rotated = parseKeyRing(`v2:${KEY_B},v1:${KEY_A}`);
    const fresh = encryptPayload(rotated, 'fresh-secret');
    expect(fresh.startsWith('v2.')).toBe(true);
    expect(decryptPayload(rotated, legacy)).toBe('legacy-secret');
    expect(decryptPayload(rotated, fresh)).toBe('fresh-secret');
  });

  it('rejects a ciphertext produced under a different key', () => {
    const ringA = parseKeyRing(`v1:${KEY_A}`);
    const ringB = parseKeyRing(`v1:${KEY_B}`);
    const stored = encryptPayload(ringA, 'secret');
    expect(() => decryptPayload(ringB, stored)).toThrow();
  });

  it('rejects tampered ciphertext (GCM auth)', () => {
    const ring = parseKeyRing(`v1:${KEY_A}`);
    const stored = encryptPayload(ring, 'secret');
    const parts = stored.split('.');
    const data = Buffer.from(parts[3]!, 'base64');
    data[0] = (data[0] ?? 0) ^ 0xff;
    parts[3] = data.toString('base64');
    expect(() => decryptPayload(ring, parts.join('.'))).toThrow();
  });

  it('rejects unknown versions and malformed input', () => {
    const ring = parseKeyRing(`v1:${KEY_A}`);
    const stored = encryptPayload(ring, 'secret');
    expect(() => decryptPayload(ring, stored.replace(/^v1\./, 'v9.'))).toThrow(/version v9/);
    expect(() => decryptPayload(ring, 'not-encrypted')).toThrow(/malformed/);
  });

  it('validates the key ring format', () => {
    expect(() => parseKeyRing('')).toThrow(/empty/);
    expect(() => parseKeyRing('v1:short')).toThrow(/32 bytes/);
    expect(() => parseKeyRing(`nope:${KEY_A}`)).toThrow(/version label/);
    expect(() => parseKeyRing(`v1:${KEY_A},v1:${KEY_B}`)).toThrow(/duplicate/);
  });

  it('hashes plaintext deterministically for dedup', () => {
    expect(hashPayload('line')).toBe(hashPayload('line'));
    expect(hashPayload('line')).not.toBe(hashPayload('line2'));
    expect(hashPayload('line')).toMatch(/^[0-9a-f]{64}$/);
  });
});
