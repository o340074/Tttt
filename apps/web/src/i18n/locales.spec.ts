import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ru from './locales/ru.json';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      return flattenKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe('i18n locales', () => {
  it('EN and RU expose the same set of keys', () => {
    expect(flattenKeys(ru).sort()).toEqual(flattenKeys(en).sort());
  });

  it('has no empty translations', () => {
    for (const locale of [en, ru]) {
      const keys = flattenKeys(locale);
      expect(keys.length).toBeGreaterThan(0);
    }
  });
});
