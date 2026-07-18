import { describe, expect, it } from 'vitest';
import {
  assertPublishable,
  computeEtaMinutes,
  deriveDeliveryType,
  normalizeBundleSpec,
  normalizeSku,
  normalizeSlug,
  normalizePositiveInt,
} from './catalog.logic';

describe('catalog.logic (E8 catalog-write rules)', () => {
  describe('deriveDeliveryType', () => {
    it('maps fulfillment to the delivery snapshot', () => {
      expect(deriveDeliveryType('READY_STOCK')).toBe('auto');
      expect(deriveDeliveryType('MADE_TO_ORDER')).toBe('manual');
    });
  });

  describe('computeEtaMinutes', () => {
    it('sums stage durations', () => {
      expect(computeEtaMinutes([{ expectedMinutes: 30 }, { expectedMinutes: 90 }])).toBe(120);
      expect(computeEtaMinutes([])).toBe(0);
    });
  });

  describe('normalizeSlug / normalizeSku', () => {
    it('lowercases/uppercases and accepts single dashes', () => {
      expect(normalizeSlug(' Google-Ads ')).toBe('google-ads');
      expect(normalizeSku(' av-100 ')).toBe('AV-100');
    });
    it('rejects bad slugs/skus', () => {
      expect(() => normalizeSlug('a')).toThrow();
      expect(() => normalizeSlug('bad slug')).toThrow();
      expect(() => normalizeSlug('double--dash')).toThrow();
      expect(() => normalizeSku('has space')).toThrow();
    });
  });

  describe('normalizePositiveInt', () => {
    it('passes positive ints, nulls empties, rejects ≤0/non-int', () => {
      expect(normalizePositiveInt(48, 'x')).toBe(48);
      expect(normalizePositiveInt(null, 'x')).toBeNull();
      expect(normalizePositiveInt(undefined, 'x')).toBeNull();
      expect(() => normalizePositiveInt(0, 'x')).toThrow();
      expect(() => normalizePositiveInt(1.5, 'x')).toThrow();
    });
  });

  describe('normalizeBundleSpec', () => {
    it('keeps known types and typed params, dropping unknown keys', () => {
      const out = normalizeBundleSpec([
        { type: 'ACCOUNT' },
        { type: 'PROXY', meta: { proxyType: 'residential', geo: 'US', term: '30d', junk: 1 } },
        { type: 'WARRANTY', meta: { hours: 72 } },
        { type: 'GUIDE', meta: { locale: 'en' } },
      ]);
      expect(out).toEqual([
        { type: 'ACCOUNT' },
        { type: 'PROXY', meta: { proxyType: 'residential', geo: 'US', term: '30d' } },
        { type: 'WARRANTY', meta: { hours: 72 } },
        { type: 'GUIDE', meta: { locale: 'en' } },
      ]);
    });

    it('empty/undefined → empty list', () => {
      expect(normalizeBundleSpec(undefined)).toEqual([]);
      expect(normalizeBundleSpec([])).toEqual([]);
    });

    it('rejects unknown component type', () => {
      expect(() => normalizeBundleSpec([{ type: 'BANANA' }])).toThrow();
    });

    it('rejects a duplicate component type', () => {
      expect(() => normalizeBundleSpec([{ type: 'PROXY' }, { type: 'PROXY' }])).toThrow();
    });

    it('rejects invalid typed params', () => {
      expect(() => normalizeBundleSpec([{ type: 'PROXY', meta: { proxyType: 'nope' } }])).toThrow();
      expect(() => normalizeBundleSpec([{ type: 'GUIDE', meta: { locale: 'fr' } }])).toThrow();
      expect(() => normalizeBundleSpec([{ type: 'WARRANTY', meta: { hours: -3 } }])).toThrow();
    });

    it('rejects a non-array spec', () => {
      expect(() => normalizeBundleSpec({ type: 'ACCOUNT' })).toThrow();
    });
  });

  describe('assertPublishable', () => {
    it('passes with an active variant that has an ETA', () => {
      expect(() =>
        assertPublishable([{ isActive: true, fulfillmentType: 'MADE_TO_ORDER', etaMinutes: 60 }]),
      ).not.toThrow();
      expect(() =>
        assertPublishable([{ isActive: true, fulfillmentType: 'READY_STOCK', etaMinutes: null }]),
      ).not.toThrow();
    });

    it('409s with no active variants', () => {
      expect(() =>
        assertPublishable([{ isActive: false, fulfillmentType: 'READY_STOCK', etaMinutes: null }]),
      ).toThrow();
    });

    it('409s when a made-to-order variant has no ETA', () => {
      expect(() =>
        assertPublishable([{ isActive: true, fulfillmentType: 'MADE_TO_ORDER', etaMinutes: null }]),
      ).toThrow();
    });
  });
});
