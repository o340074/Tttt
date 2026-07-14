import { ApiException } from '../common/api-exception';
import type {
  BundleComponent,
  BundleComponentType,
  DeliveryType,
  FulfillmentType,
  ProxyType,
} from '@advault/types';

/**
 * Pure catalog-write logic (no DB): bundle-spec normalization, ETA from plan
 * stages, delivery-type derivation and slug/sku validation. Kept side-effect
 * free so the merchandising rules are unit-tested without a database.
 */

export const BUNDLE_COMPONENT_TYPES: BundleComponentType[] = [
  'ACCOUNT',
  'PROXY',
  'OCTO_PROFILE',
  'RECOVERY',
  'SECRETS',
  'GUIDE',
  'WARRANTY',
];

const PROXY_TYPES: ProxyType[] = ['residential', 'mobile', 'isp', 'datacenter'];
const GUIDE_LOCALES = ['en', 'ru'];

/** Slugs/SKUs: lowercase alnum with single dashes, 2–64 chars. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function fail(field: string, message: string): never {
  throw new ApiException('VALIDATION_ERROR', message, 400, { fields: { [field]: [message] } });
}

/** auto ⇔ READY_STOCK, manual ⇔ MADE_TO_ORDER (kept as a derived snapshot). */
export function deriveDeliveryType(fulfillment: FulfillmentType): DeliveryType {
  return fulfillment === 'READY_STOCK' ? 'auto' : 'manual';
}

/** ETA is the sum of the expected stage durations (docs/13 §6). */
export function computeEtaMinutes(stages: { expectedMinutes: number }[]): number {
  return stages.reduce((sum, s) => sum + s.expectedMinutes, 0);
}

export function normalizeSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_RE.test(slug) || slug.length < 2 || slug.length > 64) {
    fail('slug', 'Slug must be 2–64 chars: lowercase letters, digits and single dashes');
  }
  return slug;
}

export function normalizeSku(raw: string): string {
  const sku = raw.trim().toUpperCase();
  if (!SKU_RE.test(sku) || sku.length < 2 || sku.length > 64) {
    fail('sku', 'SKU must be 2–64 chars: uppercase letters, digits and single dashes');
  }
  return sku;
}

/** A positive integer field (minutes/hours), or undefined when not provided. */
export function normalizePositiveInt(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 1) {
    fail(field, `${field} must be a positive integer`);
  }
  return value;
}

/**
 * Validate a bundle-spec entry's typed parameters and strip unknown keys, so
 * the constructor stores only meaningful, well-formed component params.
 */
function normalizeComponentMeta(
  type: BundleComponentType,
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const str = (key: string): string | undefined => {
    const v = meta[key];
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v !== 'string') fail(`bundle.${key}`, `${key} must be a string`);
    return v.trim();
  };

  switch (type) {
    case 'PROXY': {
      const proxyType = str('proxyType');
      if (proxyType !== undefined) {
        if (!(PROXY_TYPES as string[]).includes(proxyType)) {
          fail('bundle.proxyType', `proxyType must be one of ${PROXY_TYPES.join(', ')}`);
        }
        out.proxyType = proxyType;
      }
      const geo = str('geo');
      if (geo !== undefined) out.geo = geo;
      const term = str('term');
      if (term !== undefined) out.term = term;
      break;
    }
    case 'OCTO_PROFILE': {
      const profileType = str('profileType');
      if (profileType !== undefined) out.profileType = profileType;
      break;
    }
    case 'GUIDE': {
      const locale = str('locale');
      if (locale !== undefined) {
        if (!GUIDE_LOCALES.includes(locale)) {
          fail('bundle.locale', `guide locale must be one of ${GUIDE_LOCALES.join(', ')}`);
        }
        out.locale = locale;
      }
      break;
    }
    case 'WARRANTY': {
      const hours = normalizePositiveInt(
        typeof meta.hours === 'number' ? meta.hours : undefined,
        'bundle.hours',
      );
      if (meta.hours !== undefined && hours === null && meta.hours !== null) {
        fail('bundle.hours', 'warranty hours must be a positive integer');
      }
      if (hours !== null) out.hours = hours;
      break;
    }
    case 'ACCOUNT': {
      const geo = str('geo');
      if (geo !== undefined) out.geo = geo;
      break;
    }
    // RECOVERY / SECRETS carry no parameters.
    default:
      break;
  }
  return out;
}

/**
 * Validate & normalize a bundle spec (the delivery-kit constructor, docs/13 §5).
 * Each entry is `{ type, meta? }`; unknown types are rejected, params are typed,
 * and a component type may not repeat. Returns the canonical component list.
 */
export function normalizeBundleSpec(input: unknown): BundleComponent[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) fail('bundle', 'bundle must be an array of components');

  const seen = new Set<BundleComponentType>();
  const out: BundleComponent[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      fail('bundle', 'each bundle component must be an object');
    }
    const { type, meta } = raw as { type?: unknown; meta?: unknown };
    if (typeof type !== 'string' || !(BUNDLE_COMPONENT_TYPES as string[]).includes(type)) {
      fail('bundle.type', `component type must be one of ${BUNDLE_COMPONENT_TYPES.join(', ')}`);
    }
    const t = type as BundleComponentType;
    if (seen.has(t)) fail('bundle.type', `component ${t} is listed more than once`);
    seen.add(t);

    const metaObj =
      meta && typeof meta === 'object' && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : {};
    const normalizedMeta = normalizeComponentMeta(t, metaObj);
    out.push(
      Object.keys(normalizedMeta).length > 0 ? { type: t, meta: normalizedMeta } : { type: t },
    );
  }
  return out;
}

/**
 * Guard for publishing a product: it must have at least one active variant, and
 * every MADE_TO_ORDER variant must be able to produce an ETA (a linked plan or a
 * cached etaMinutes) so the buyer always sees an estimate (docs/13 §5).
 */
export function assertPublishable(
  variants: { isActive: boolean; fulfillmentType: FulfillmentType; etaMinutes: number | null }[],
): void {
  const active = variants.filter((v) => v.isActive);
  if (active.length === 0) {
    throw new ApiException('CONFLICT', 'Cannot publish a product with no active variants', 409);
  }
  const noEta = active.some((v) => v.fulfillmentType === 'MADE_TO_ORDER' && v.etaMinutes === null);
  if (noEta) {
    throw new ApiException(
      'CONFLICT',
      'Every made-to-order variant needs a warming plan or an ETA before publishing',
      409,
    );
  }
}
