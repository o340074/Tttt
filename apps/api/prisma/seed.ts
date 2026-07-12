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
import type { FulfillmentType, Prisma, Role } from '@prisma/client';

const prisma = new PrismaClient();

// Dev-only demo password for all seeded users. Never seed real credentials.
const DEMO_PASSWORD = 'advault-dev-password';

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
        stockCount: 37,
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
        stockCount: 12,
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
        stockCount: 88,
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
        stockCount: 40,
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

async function seedProducts(categoryIdBySlug: Map<string, string>): Promise<void> {
  let variantCount = 0;
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
      const data = {
        productId: row.id,
        price: variant.price,
        currency: 'USD',
        deliveryType,
        fulfillmentType: variant.fulfillmentType,
        stockCount: variant.stockCount ?? 0,
        goal: variant.goal ?? null,
        tier: variant.tier ?? null,
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
      await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        update: data,
        create: { sku: variant.sku, ...data },
      });
      variantCount += 1;
    }
  }
  console.log(`Seeded ${products.length} products with ${variantCount} variants`);
}

async function main(): Promise<void> {
  await seedUsers();
  const categoryIdBySlug = await seedCategories();
  await seedProducts(categoryIdBySlug);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
