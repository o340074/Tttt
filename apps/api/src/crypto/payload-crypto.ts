import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Application-level encryption for stock/delivery payloads (docs/09):
 * AES-256-GCM with a versioned key ring from PAYLOAD_ENCRYPTION_KEY.
 * Env format: "v1:<base64 32B>[,v0:<base64 32B>]" — the FIRST key encrypts,
 * every listed key decrypts. The ciphertext is self-describing
 * ("v1.<iv>.<tag>.<ct>", all base64), so rotation is prepending a new
 * version and re-deploying; old rows stay readable and can be re-encrypted
 * lazily. Plain functions (no DI) so the Prisma seed can share them.
 */

export interface KeyRing {
  /** Version label the next encryption will use (first env entry). */
  activeVersion: string;
  keys: Map<string, Buffer>;
}

/**
 * Dev-only default key ring (32 bytes of "advault-dev-payload-key-change!!").
 * Shared by the env default and the seed; production MUST override it.
 */
export const DEV_PAYLOAD_KEY = 'v1:YWR2YXVsdC1kZXYtcGF5bG9hZC1rZXktY2hhbmdlISE=';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION_RE = /^v\d+$/;

export function parseKeyRing(envValue: string): KeyRing {
  const entries = envValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    throw new Error('PAYLOAD_ENCRYPTION_KEY is empty');
  }
  const keys = new Map<string, Buffer>();
  for (const entry of entries) {
    const separator = entry.indexOf(':');
    const version = separator > 0 ? entry.slice(0, separator) : '';
    const encoded = separator > 0 ? entry.slice(separator + 1) : '';
    if (!VERSION_RE.test(version)) {
      throw new Error(`PAYLOAD_ENCRYPTION_KEY: bad version label "${version}" (expected v<N>)`);
    }
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(`PAYLOAD_ENCRYPTION_KEY: key ${version} must be ${KEY_BYTES} bytes base64`);
    }
    if (keys.has(version)) {
      throw new Error(`PAYLOAD_ENCRYPTION_KEY: duplicate version ${version}`);
    }
    keys.set(version, key);
  }
  const first = entries[0]!;
  return { activeVersion: first.slice(0, first.indexOf(':')), keys };
}

/** Encrypt with the active key → "v1.<iv>.<tag>.<ciphertext>" (base64 parts). */
export function encryptPayload(ring: KeyRing, plaintext: string): string {
  const key = ring.keys.get(ring.activeVersion)!;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ring.activeVersion,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/** Decrypt any supported version; throws on unknown version, tampering or a wrong key. */
export function decryptPayload(ring: KeyRing, stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 4) {
    throw new Error('Encrypted payload is malformed (expected version.iv.tag.ciphertext)');
  }
  const [version, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  const key = ring.keys.get(version);
  if (!key) {
    throw new Error(`No decryption key for payload version ${version}`);
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** SHA-256 of the plaintext — the import dedup key (ciphertexts never repeat). */
export function hashPayload(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}
