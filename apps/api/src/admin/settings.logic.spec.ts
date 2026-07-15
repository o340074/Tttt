import { describe, expect, it } from 'vitest';
import { applyUpdate, buildSettings, SETTING_KEYS } from './settings.logic';

const FLAGS = { cryptoAcquiringConfigured: false, octoApiConfigured: false, kmsConfigured: false };

describe('settings.logic', () => {
  it('builds defaults from an empty store', () => {
    const s = buildSettings({}, FLAGS);
    expect(s.storeName).toBe('AdVault');
    expect(s.defaultLocale).toBe('en');
    expect(s.enabledLocales).toEqual(['en', 'ru']);
    expect(s.notifications.orderPaid.subject).toContain('confirmed');
    expect(s.integrations).toEqual(FLAGS);
  });

  it('overlays stored values and drops unknown keys', () => {
    const rows = {
      [SETTING_KEYS.store]: {
        storeName: 'MyShop',
        enabledLocales: ['ru', 'xx'],
        junk: 'ignored',
      },
    };
    const s = buildSettings(rows, FLAGS);
    expect(s.storeName).toBe('MyShop');
    expect(s.enabledLocales).toEqual(['ru']); // 'xx' filtered out
  });

  it('applies a partial update and trims the store name', () => {
    const { store, error } = applyUpdate({}, { storeName: '  Neo  ' });
    expect(error).toBeUndefined();
    expect(store.storeName).toBe('Neo');
  });

  it('rejects an empty enabledLocales', () => {
    const { error } = applyUpdate({}, { enabledLocales: [] });
    expect(error).toBeTruthy();
  });

  it('rejects a defaultLocale outside enabledLocales', () => {
    const { error } = applyUpdate({}, { defaultLocale: 'ru', enabledLocales: ['en'] });
    expect(error).toContain('defaultLocale');
  });

  it('merges a single notification template field without wiping the rest', () => {
    const { notifications } = applyUpdate(
      {},
      { notifications: { orderPaid: { subject: 'New subject', body: '' } } },
    );
    expect(notifications.orderPaid.subject).toBe('New subject');
    // Untouched templates keep their defaults.
    expect(notifications.warmingReady.subject).toContain('ready');
  });
});
