/**
 * Demo seed (docs/backend/prisma-schema.md → «Заметки по сидированию»).
 * Idempotent: every write is an upsert keyed by a unique field
 * (email / slug / sku / (entityId, locale)), so re-runs never duplicate.
 * No real secrets — demo users and fictional catalog data only.
 *
 * Run: pnpm --filter @advault/api db:seed  (or `npx prisma db seed`).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  DEV_PAYLOAD_KEY,
  encryptPayload,
  hashPayload,
  parseKeyRing,
} from '../src/crypto/payload-crypto';
import type { FulfillmentType, Prisma, PromoType, Role } from '@prisma/client';

const prisma = new PrismaClient();

// Dev-only demo password for all seeded users. Never seed real credentials.
const DEMO_PASSWORD = 'advault-dev-password';

// Same key ring the API uses, so seeded stock decrypts through the app.
const keyRing = parseKeyRing(process.env.PAYLOAD_ENCRYPTION_KEY ?? DEV_PAYLOAD_KEY);

interface CategorySeed {
  slug: string;
  position: number;
  parentSlug?: string;
  name: { en: string; ru: string };
}

interface VariantSeed {
  sku: string;
  price: string; // Money as string — never floats
  fulfillmentType: FulfillmentType;
  stockCount?: number;
  goal?: string;
  tier?: string;
  etaMinutes?: number;
  warrantyHours?: number;
  bundleSpec?: Prisma.InputJsonValue;
  name: { en: string; ru: string };
  attributes?: Record<string, unknown>;
}

interface StageSeed {
  name: string;
  expectedMinutes: number;
  checklist?: string[];
  requiredComponents?: string[];
}

interface WarmingPlanSeed {
  goal: string;
  tier: string;
  name: string;
  stages: StageSeed[];
}

const DAY = 24 * 60;

/**
 * Warming plans (docs/12): ordered stages with expected durations that sum to
 * the variant ETA. Stage durations drive the buyer ETA and operator SLA. These
 * are operational checklists only — the platform tracks work, it does not
 * automate warming (docs/09).
 */
const warmingPlans: WarmingPlanSeed[] = [
  {
    goal: 'google_ads',
    tier: 'warm_7d',
    name: 'Google Ads · Warm 7 days',
    stages: [
      {
        name: 'Environment prep',
        expectedMinutes: 240,
        requiredComponents: ['PROXY', 'OCTO_PROFILE'],
        checklist: ['Allocate proxy', 'Create Octo profile', 'Bind profile to proxy'],
      },
      {
        name: 'Account setup',
        expectedMinutes: 240,
        requiredComponents: ['ACCOUNT'],
        checklist: ['Prepare account', 'Record recovery data'],
      },
      {
        name: 'Rest / low activity',
        expectedMinutes: 3 * DAY,
        checklist: ['Scheduled status checks'],
      },
      {
        name: 'Goal preparation (Ads)',
        expectedMinutes: 3 * DAY,
        checklist: ['Per-playbook actions for the target'],
      },
      {
        name: 'Final QC',
        expectedMinutes: 480,
        checklist: ['Verify sign-in', 'Verify bundle completeness'],
      },
      {
        name: 'Bundle assembly',
        expectedMinutes: 480,
        requiredComponents: ['ACCOUNT', 'PROXY', 'OCTO_PROFILE', 'GUIDE'],
        checklist: ['Assemble account + proxy + profile + guide'],
      },
    ],
  },
  {
    goal: 'google_ads',
    tier: 'warm_14d',
    name: 'Google Ads · Warm 14 days',
    stages: [
      {
        name: 'Environment prep',
        expectedMinutes: 240,
        requiredComponents: ['PROXY', 'OCTO_PROFILE'],
      },
      { name: 'Account setup', expectedMinutes: 240, requiredComponents: ['ACCOUNT'] },
      { name: 'Rest / low activity', expectedMinutes: 6 * DAY },
      { name: 'Goal preparation (Ads)', expectedMinutes: 6 * DAY + 3 * DAY },
      { name: 'Final QC', expectedMinutes: 720 },
      {
        name: 'Bundle assembly',
        expectedMinutes: 720,
        requiredComponents: ['ACCOUNT', 'PROXY', 'OCTO_PROFILE', 'GUIDE'],
      },
    ],
  },
  {
    goal: 'google_ads',
    tier: 'agency',
    name: 'Google Ads · Agency prep',
    stages: [
      { name: 'Environment prep', expectedMinutes: 240 },
      { name: 'Agency account setup', expectedMinutes: 1440, requiredComponents: ['ACCOUNT'] },
      { name: 'Raise limits', expectedMinutes: 2160 },
      { name: 'QC + assembly', expectedMinutes: 480, requiredComponents: ['ACCOUNT', 'GUIDE'] },
    ],
  },
  {
    goal: 'chrome_extension_dev',
    tier: 'warm_5d',
    name: 'Chrome dev · Warm 5 days',
    stages: [
      {
        name: 'Developer account setup',
        expectedMinutes: 480,
        requiredComponents: ['ACCOUNT'],
        checklist: ['Register developer account', 'Record access'],
      },
      {
        name: 'Extension console access',
        expectedMinutes: 2 * DAY,
        checklist: ['Confirm publishing readiness'],
      },
      { name: 'Rest / activity', expectedMinutes: 3360 },
      {
        name: 'QC + assembly',
        expectedMinutes: 480,
        requiredComponents: ['ACCOUNT', 'RECOVERY', 'GUIDE'],
      },
    ],
  },
];

interface ProductSeed {
  slug: string;
  categorySlug: string;
  ratingAvg?: string;
  attributes: Record<string, unknown>;
  translations: {
    en: { name: string; description: string };
    ru: { name: string; description: string };
  };
  variants: VariantSeed[];
}

const categories: CategorySeed[] = [
  { slug: 'google-ads', position: 1, name: { en: 'Google Ads', ru: 'Google Ads' } },
  {
    slug: 'google-ads-agency',
    position: 1,
    parentSlug: 'google-ads',
    name: { en: 'Agency accounts', ru: 'Агентские аккаунты' },
  },
  {
    slug: 'developer-accounts',
    position: 2,
    name: { en: 'Developer accounts', ru: 'Аккаунты разработчика' },
  },
  { slug: 'aged-accounts', position: 3, name: { en: 'Aged & spent', ru: 'Отлёжка и расход' } },
  { slug: 'proxies', position: 4, name: { en: 'Proxies', ru: 'Прокси' } },
  {
    slug: 'antidetect',
    position: 5,
    name: { en: 'Anti-detect profiles', ru: 'Антидетект-профили' },
  },
];

const WEEK_MINUTES = 7 * 24 * 60;

const products: ProductSeed[] = [
  {
    slug: 'google-ads-us-verified',
    categorySlug: 'google-ads',
    ratingAvg: '4.90',
    attributes: { icon: 'ads', geo: 'US', kind: 'verified' },
    translations: {
      en: {
        name: 'Google Ads — US Verified',
        description:
          'Aged verified Google Ads account with US billing and no spend history, ready for immediate use. Delivered with full credentials, recovery email and a setup guide.',
      },
      ru: {
        name: 'Google Ads — верифицированный US',
        description:
          'Отлёжанный верифицированный аккаунт Google Ads с биллингом US и без истории расходов — готов к работе сразу. Выдаётся с полными доступами, resque-почтой и гайдом по настройке.',
      },
    },
    variants: [
      {
        sku: 'GADS-US-STD',
        price: '42.00',
        fulfillmentType: 'READY_STOCK',
        stockCount: 14,
        warrantyHours: 48,
        name: { en: 'Standard', ru: 'Стандарт' },
        bundleSpec: [
          { type: 'ACCOUNT' },
          { type: 'RECOVERY' },
          { type: 'GUIDE' },
          { type: 'WARRANTY', meta: { hours: 48 } },
        ],
      },
      {
        sku: 'GADS-US-AGED6',
        price: '68.00',
        fulfillmentType: 'READY_STOCK',
        stockCount: 8,
        warrantyHours: 48,
        name: { en: 'Aged 6 months', ru: 'Отлёжка 6 месяцев' },
        attributes: { agedMonths: 6 },
        bundleSpec: [
          { type: 'ACCOUNT' },
          { type: 'RECOVERY' },
          { type: 'GUIDE' },
          { type: 'WARRANTY', meta: { hours: 48 } },
        ],
      },
    ],
  },
  {
    slug: 'google-ads-warm',
    categorySlug: 'google-ads',
    ratingAvg: '4.80',
    attributes: { icon: 'ads', geo: 'US/EU', kind: 'warmed' },
    translations: {
      en: {
        name: 'Google Ads — warmed to order',
        description:
          'An operator warms a fresh account up to advertising readiness for your goal: real activity, consistent fingerprint and a dedicated proxy. Delivered as a bundle — account, proxy, Octo browser profile and a launch guide.',
      },
      ru: {
        name: 'Google Ads — прогрев под заказ',
        description:
          'Оператор прогревает аккаунт до рекламной готовности под вашу цель: реальная активность, консистентный отпечаток и выделенный прокси. Выдаётся комплектом — аккаунт, прокси, Octo-профиль браузера и гайд по запуску.',
      },
    },
    variants: [
      {
        sku: 'GADS-WARM-7D',
        price: '180.00',
        fulfillmentType: 'MADE_TO_ORDER',
        goal: 'google_ads',
        tier: 'warm_7d',
        etaMinutes: WEEK_MINUTES,
        warrantyHours: 72,
        name: { en: 'Warm-up · 7 days', ru: 'Прогрев · 7 дней' },
        bundleSpec: [
          { type: 'ACCOUNT' },
          { type: 'PROXY', meta: { geo: 'US', kind: 'residential', termDays: 30 } },
          { type: 'OCTO_PROFILE' },
          { type: 'GUIDE' },
          { type: 'WARRANTY', meta: { hours: 72 } },
        ],
      },
      {
        sku: 'GADS-WARM-14D',
        price: '260.00',
        fulfillmentType: 'MADE_TO_ORDER',
        goal: 'google_ads',
        tier: 'warm_14d',
        etaMinutes: 2 * WEEK_MINUTES,
        warrantyHours: 72,
        name: { en: 'Warm-up · 14 days', ru: 'Прогрев · 14 дней' },
        bundleSpec: [
          { type: 'ACCOUNT' },
          { type: 'PROXY', meta: { geo: 'US', kind: 'residential', termDays: 30 } },
          { type: 'OCTO_PROFILE' },
          { type: 'GUIDE' },
          { type: 'WARRANTY', meta: { hours: 72 } },
        ],
      },
    ],
  },
  {
    slug: 'google-ads-agency-eu',
    categorySlug: 'google-ads-agency',
    ratingAvg: '4.70',
    attributes: { icon: 'briefcase', geo: 'EU', kind: 'agency' },
    translations: {
      en: {
        name: 'Agency account — EU',
        description:
          'Google Ads agency account with EU billing and raised limits, prepared to order. Suitable for scaling campaigns beyond regular account limits.',
      },
      ru: {
        name: 'Агентский аккаунт — EU',
        description:
          'Агентский аккаунт Google Ads с биллингом EU и повышенными лимитами, готовится под заказ. Подходит для масштабирования кампаний за пределами лимитов обычных аккаунтов.',
      },
    },
    variants: [
      {
        sku: 'GADS-AGENCY-EU',
        price: '240.00',
        fulfillmentType: 'MADE_TO_ORDER',
        goal: 'google_ads',
        tier: 'agency',
        etaMinutes: 3 * 24 * 60,
        warrantyHours: 24,
        name: { en: 'Agency', ru: 'Агентский' },
        bundleSpec: [
          { type: 'ACCOUNT' },
          { type: 'GUIDE' },
          { type: 'WARRANTY', meta: { hours: 24 } },
        ],
      },
    ],
  },
  {
    slug: 'chrome-dev-account',
    categorySlug: 'developer-accounts',
    ratingAvg: '4.85',
    attributes: { icon: 'verify', geo: 'Global', kind: 'developer' },
    translations: {
      en: {
        name: 'Chrome Web Store developer account',
        description:
          'Google developer account for publishing Chrome extensions: registration fee paid, recovery data included. Choose a ready-made account or a warmed-to-order one with activity history.',
      },
      ru: {
        name: 'Аккаунт разработчика Chrome Web Store',
        description:
          'Google-аккаунт разработчика для публикации расширений Chrome: взнос оплачен, recovery-данные в комплекте. На выбор — готовый аккаунт или прогретый под заказ с историей активности.',
      },
    },
    variants: [
      {
        sku: 'CWS-DEV-READY',
        price: '150.00',
        fulfillmentType: 'READY_STOCK',
        stockCount: 3,
        warrantyHours: 24,
        name: { en: 'Ready-made', ru: 'Готовый' },
        bundleSpec: [
          { type: 'ACCOUNT' },
          { type: 'RECOVERY' },
          { type: 'GUIDE' },
          { type: 'WARRANTY', meta: { hours: 24 } },
        ],
      },
      {
        sku: 'CWS-DEV-WARM-5D',
        price: '95.00',
        fulfillmentType: 'MADE_TO_ORDER',
        goal: 'chrome_extension_dev',
        tier: 'warm_5d',
        etaMinutes: 5 * 24 * 60,
        warrantyHours: 48,
        name: { en: 'Warmed · 5 days', ru: 'Прогрев · 5 дней' },
        bundleSpec: [
          { type: 'ACCOUNT' },
          { type: 'RECOVERY' },
          { type: 'GUIDE' },
          { type: 'WARRANTY', meta: { hours: 48 } },
        ],
      },
    ],
  },
  {
    slug: 'gmail-aged-global',
    categorySlug: 'aged-accounts',
    ratingAvg: '4.60',
    attributes: { icon: 'clock', geo: 'Global', kind: 'aged' },
    translations: {
      en: {
        name: 'Aged Gmail — Global',
        description:
          'Gmail account aged 12+ months with organic activity history. Includes recovery email. Instant delivery from stock.',
      },
      ru: {
        name: 'Отлёжанный Gmail — Global',
        description:
          'Аккаунт Gmail с отлёжкой 12+ месяцев и органической историей активности. В комплекте recovery-почта. Мгновенная выдача из стока.',
      },
    },
    variants: [
      {
        sku: 'GMAIL-AGED-1Y',
        price: '9.90',
        fulfillmentType: 'READY_STOCK',
        stockCount: 16,
        warrantyHours: 24,
        name: { en: 'Aged 12+ months', ru: 'Отлёжка 12+ месяцев' },
        bundleSpec: [
          { type: 'ACCOUNT' },
          { type: 'RECOVERY' },
          { type: 'WARRANTY', meta: { hours: 24 } },
        ],
      },
    ],
  },
  {
    slug: 'proxy-residential-us',
    categorySlug: 'proxies',
    ratingAvg: '4.75',
    attributes: { icon: 'globe', geo: 'US', kind: 'proxy' },
    translations: {
      en: {
        name: 'Residential proxy — US, 30 days',
        description:
          'Dedicated residential US proxy for ad accounts: static IP, 30-day term, instant delivery. Pairs well with warmed accounts.',
      },
      ru: {
        name: 'Резидентный прокси — US, 30 дней',
        description:
          'Выделенный резидентный US-прокси под рекламные аккаунты: статичный IP, срок 30 дней, мгновенная выдача. Отлично сочетается с прогретыми аккаунтами.',
      },
    },
    variants: [
      {
        sku: 'PROXY-RES-US-30D',
        price: '24.00',
        fulfillmentType: 'READY_STOCK',
        stockCount: 12,
        name: { en: 'Monthly', ru: 'На месяц' },
        bundleSpec: [
          { type: 'PROXY', meta: { geo: 'US', kind: 'residential', termDays: 30 } },
          { type: 'GUIDE' },
        ],
      },
    ],
  },
];

async function seedUsers(): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const users: { email: string; role: Role }[] = [
    { email: 'admin@advault.dev', role: 'admin' },
    { email: 'support@advault.dev', role: 'support' },
    { email: 'user@advault.dev', role: 'user' },
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { role: user.role },
      create: {
        email: user.email,
        passwordHash,
        role: user.role,
        locale: 'en',
        emailVerifiedAt: new Date(),
      },
    });
  }
  console.log(`Seeded ${users.length} demo users (password: ${DEMO_PASSWORD})`);
}

async function seedCategories(): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  for (const cat of categories) {
    const parentId = cat.parentSlug ? (idBySlug.get(cat.parentSlug) ?? null) : null;
    const row = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { position: cat.position, parentId },
      create: { slug: cat.slug, position: cat.position, parentId },
    });
    idBySlug.set(cat.slug, row.id);
    for (const locale of ['en', 'ru'] as const) {
      await prisma.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: row.id, locale } },
        update: { name: cat.name[locale] },
        create: { categoryId: row.id, locale, name: cat.name[locale] },
      });
    }
  }
  console.log(`Seeded ${categories.length} categories`);
  return idBySlug;
}

/** Upsert warming plans + their stages; returns planId by "goal:tier". */
async function seedWarmingPlans(): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();
  let stageCount = 0;
  for (const plan of warmingPlans) {
    const row = await prisma.warmingPlan.upsert({
      where: { goal_tier_version: { goal: plan.goal, tier: plan.tier, version: 1 } },
      update: { name: plan.name, isActive: true },
      create: { goal: plan.goal, tier: plan.tier, version: 1, name: plan.name, isActive: true },
    });
    idByKey.set(`${plan.goal}:${plan.tier}`, row.id);
    for (const [order, stage] of plan.stages.entries()) {
      const data = {
        name: stage.name,
        expectedMinutes: stage.expectedMinutes,
        checklist: (stage.checklist ?? []) as Prisma.InputJsonValue,
        requiredComponents: (stage.requiredComponents ?? []) as Prisma.InputJsonValue,
      };
      await prisma.warmingStageTemplate.upsert({
        where: { planId_order: { planId: row.id, order } },
        update: data,
        create: { planId: row.id, order, ...data },
      });
      stageCount += 1;
    }
  }
  console.log(`Seeded ${warmingPlans.length} warming plans with ${stageCount} stages`);
  return idByKey;
}

async function seedProducts(
  categoryIdBySlug: Map<string, string>,
  planIdByKey: Map<string, string>,
): Promise<void> {
  let variantCount = 0;
  let stockCount = 0;
  for (const product of products) {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    if (!categoryId) throw new Error(`Unknown category slug: ${product.categorySlug}`);

    const row = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        categoryId,
        status: 'published',
        ratingAvg: product.ratingAvg,
        attributes: product.attributes as Prisma.InputJsonValue,
      },
      create: {
        slug: product.slug,
        categoryId,
        status: 'published',
        ratingAvg: product.ratingAvg,
        attributes: product.attributes as Prisma.InputJsonValue,
      },
    });

    for (const locale of ['en', 'ru'] as const) {
      const translation = product.translations[locale];
      await prisma.productTranslation.upsert({
        where: { productId_locale: { productId: row.id, locale } },
        update: translation,
        create: { productId: row.id, locale, ...translation },
      });
    }

    for (const variant of product.variants) {
      // deliveryType is a derived snapshot — always consistent with fulfillmentType.
      const deliveryType = variant.fulfillmentType === 'READY_STOCK' ? 'auto' : 'manual';
      // Link MADE_TO_ORDER variants to their warming plan by (goal, tier).
      const warmingPlanId =
        variant.fulfillmentType === 'MADE_TO_ORDER' && variant.goal && variant.tier
          ? (planIdByKey.get(`${variant.goal}:${variant.tier}`) ?? null)
          : null;
      const data = {
        productId: row.id,
        price: variant.price,
        currency: 'USD',
        deliveryType,
        fulfillmentType: variant.fulfillmentType,
        stockCount: variant.stockCount ?? 0,
        goal: variant.goal ?? null,
        tier: variant.tier ?? null,
        warmingPlanId,
        etaMinutes: variant.etaMinutes ?? null,
        warrantyHours: variant.warrantyHours ?? null,
        bundleSpec: (variant.bundleSpec ?? []) as Prisma.InputJsonValue,
        isActive: true,
        attributes: {
          name_en: variant.name.en,
          name_ru: variant.name.ru,
          ...(variant.attributes ?? {}),
        } as Prisma.InputJsonValue,
      } as const;
      const variantRow = await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        update: data,
        create: { sku: variant.sku, ...data },
      });
      variantCount += 1;

      // READY_STOCK variants get an encrypted stock pool; stockCount is derived from it.
      if (variant.fulfillmentType === 'READY_STOCK') {
        stockCount += await seedStock(variantRow.id, variant.sku, variant.stockCount ?? 0);
      }
    }
  }
  console.log(`Seeded ${products.length} products with ${variantCount} variants`);
  console.log(`Seeded ${stockCount} encrypted stock units across ready-stock variants`);
}

/** A believable demo credential line for a stock unit — fictional, never a real secret. */
function demoStockLine(sku: string, index: number): string {
  const tag = `${sku.toLowerCase()}_${String(index + 1).padStart(2, '0')}`;
  if (sku.startsWith('PROXY')) {
    return `host: 154.12.${index + 10}.7 | port: 8000 | user: proxy_${tag} | pass: Px-${tag}-9f`;
  }
  return [
    `login: demo_${tag}@mailbox.io`,
    `password: Demo!${sku.slice(-3)}-${index + 1}xZ`,
    `recovery: recover_${tag}@proton.me`,
  ].join('\n');
}

/**
 * Seed (idempotently) a variant's stock pool with encrypted demo payloads and
 * set stockCount to the live available count. Deterministic lines → stable
 * payloadHash, so re-runs skip existing units via the (variantId, payloadHash)
 * unique key. Encryption mirrors the app so the Vault can decrypt.
 */
async function seedStock(variantId: string, sku: string, count: number): Promise<number> {
  for (let i = 0; i < count; i += 1) {
    const line = demoStockLine(sku, i);
    const payloadHash = hashPayload(line);
    await prisma.stockItem.upsert({
      where: { variantId_payloadHash: { variantId, payloadHash } },
      update: {}, // keep an existing unit (and its sold/reserved status) as-is
      create: { variantId, payload: encryptPayload(keyRing, line), payloadHash },
    });
  }
  const available = await prisma.stockItem.count({ where: { variantId, status: 'available' } });
  await prisma.productVariant.update({ where: { id: variantId }, data: { stockCount: available } });
  return count;
}

interface PromoSeed {
  code: string;
  type: PromoType;
  value: string; // percent (10.00 = 10%) or fixed amount — Money as string
  maxUses?: number;
  expiresAt?: Date;
}

const promoCodes: PromoSeed[] = [
  { code: 'AURORA10', type: 'percent', value: '10.00', maxUses: 1000 },
  { code: 'SAVE5', type: 'fixed', value: '5.00' },
  // Expired on purpose — exercises PROMO_INVALID validation in demos.
  { code: 'EXPIRED10', type: 'percent', value: '10.00', expiresAt: new Date('2026-01-01') },
];

async function seedPromoCodes(): Promise<void> {
  for (const promo of promoCodes) {
    const data = {
      type: promo.type,
      value: promo.value,
      maxUses: promo.maxUses ?? null,
      expiresAt: promo.expiresAt ?? null,
    };
    await prisma.promoCode.upsert({
      where: { code: promo.code },
      update: data,
      create: { code: promo.code, ...data },
    });
  }
  console.log(`Seeded ${promoCodes.length} promo codes`);
}

async function main(): Promise<void> {
  await seedUsers();
  const categoryIdBySlug = await seedCategories();
  const planIdByKey = await seedWarmingPlans();
  await seedProducts(categoryIdBySlug, planIdByKey);
  await seedPromoCodes();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
