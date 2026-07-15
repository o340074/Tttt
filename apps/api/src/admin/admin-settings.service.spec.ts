import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service';
import { makeFakeConfigService, makeFakePrismaService } from '../testing/fakes';
import { AdminSettingsService } from './admin-settings.service';

/**
 * AdminSettingsService over the fakes: defaults from an empty store, a partial
 * update that persists + audits, validation, and integration flags derived
 * read-only from env (never secrets).
 */
describe('AdminSettingsService (E8 settings)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let settings: AdminSettingsService;
  const adminId = randomUUID();

  beforeEach(() => {
    prisma = makeFakePrismaService();
    settings = new AdminSettingsService(prisma, new AuditService(prisma), makeFakeConfigService());
  });

  it('returns typed defaults when the store is empty', async () => {
    const s = await settings.get();
    expect(s.storeName).toBe('AdVault');
    expect(s.enabledLocales).toEqual(['en', 'ru']);
    // Octo has no integration yet → always reported as not-configured.
    expect(s.integrations.octoApiConfigured).toBe(false);
    expect(s.integrations).toHaveProperty('kmsConfigured');
  });

  it('persists a partial update and records an audit entry', async () => {
    const updated = await settings.update(adminId, { storeName: 'AdVault Pro' });
    expect(updated.storeName).toBe('AdVault Pro');
    expect(prisma.setting.rows.some((r) => r.key === 'store')).toBe(true);
    expect(prisma.auditLog.rows.some((a) => a.action === 'settings.update')).toBe(true);

    // Round-trips through the store.
    const again = await settings.get();
    expect(again.storeName).toBe('AdVault Pro');
  });

  it('rejects a defaultLocale not in enabledLocales', async () => {
    await expect(
      settings.update(adminId, { defaultLocale: 'ru', enabledLocales: ['en'] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('never stores a secret — only derived flags are exposed', async () => {
    await settings.update(adminId, { storeName: 'x' });
    const stored = JSON.stringify(prisma.setting.rows);
    expect(stored).not.toContain('secret');
    expect(stored).not.toContain('ENCRYPTION');
  });
});
