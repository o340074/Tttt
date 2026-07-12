import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id and never stores the plain password', async () => {
    const hash = await service.hash('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('correct horse battery');
  });

  it('verifies a matching password and rejects a wrong one', async () => {
    const hash = await service.hash('s3cret-password');
    await expect(service.verify(hash, 's3cret-password')).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('treats a malformed hash as a mismatch instead of throwing', async () => {
    await expect(service.verify('not-a-hash', 'whatever')).resolves.toBe(false);
  });
});
