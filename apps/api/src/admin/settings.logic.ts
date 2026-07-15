import type {
  LocalizedNotificationTemplate,
  Locale,
  NotificationEventKey,
  NotificationTemplate,
  ShopSettings,
  UpdateSettingsRequest,
} from '@advault/types';

/** Setting store keys owned by the typed layer. */
export const SETTING_KEYS = {
  store: 'store',
  notifications: 'notifications',
} as const;

const SUPPORTED_LOCALES: Locale[] = ['en', 'ru'];

/** Stored (non-secret) settings, split by store key. */
interface StoreSection {
  storeName: string;
  supportEmail: string;
  defaultLocale: Locale;
  enabledLocales: Locale[];
}
type NotificationsSection = ShopSettings['notifications'];

/** The transactional events that carry a localized template (E9). */
export const NOTIFICATION_EVENTS: NotificationEventKey[] = [
  'orderPaid',
  'warmingReady',
  'ticketReply',
];

const DEFAULT_STORE: StoreSection = {
  storeName: 'AdVault',
  supportEmail: 'support@advault.example',
  defaultLocale: 'en',
  enabledLocales: ['en', 'ru'],
};

const tpl = (subject: string, body: string): NotificationTemplate => ({ subject, body });

/** Localized default templates (EN + RU). `{{number}}` is substituted at send. */
const DEFAULT_NOTIFICATIONS: NotificationsSection = {
  orderPaid: {
    en: tpl('Your AdVault order is confirmed', 'Order {{number}} is paid. Thank you!'),
    ru: tpl('Ваш заказ AdVault подтверждён', 'Заказ {{number}} оплачен. Спасибо!'),
  },
  warmingReady: {
    en: tpl('Your account is ready', 'Order {{number}} has been delivered to your Vault.'),
    ru: tpl('Ваш аккаунт готов', 'Заказ {{number}} доставлен в ваш Vault.'),
  },
  ticketReply: {
    en: tpl('Support replied to your ticket', 'Ticket {{number}} has a new reply.'),
    ru: tpl('Поддержка ответила на ваш тикет', 'В тикете {{number}} новый ответ.'),
  },
};

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as string[]).includes(value);
}

function mergeOne(base: NotificationTemplate, raw: unknown): NotificationTemplate {
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<NotificationTemplate>;
  return {
    // An empty string means "clear back to default" so a blank field never ships.
    subject: typeof r.subject === 'string' && r.subject.trim() ? r.subject : base.subject,
    body: typeof r.body === 'string' && r.body.trim() ? r.body : base.body,
  };
}

/** Merge a per-locale template patch onto a localized base (unknown locales dropped). */
function mergeTemplate(
  base: LocalizedNotificationTemplate,
  raw: unknown,
): LocalizedNotificationTemplate {
  if (!raw || typeof raw !== 'object') return { ...base };
  const r = raw as Record<string, unknown>;
  const out = { ...base } as LocalizedNotificationTemplate;
  for (const locale of SUPPORTED_LOCALES) {
    out[locale] = mergeOne(base[locale], r[locale]);
  }
  return out;
}

/** Coerce a raw stored `store` value onto typed defaults (unknown keys dropped). */
export function readStore(raw: unknown): StoreSection {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const enabled = Array.isArray(r.enabledLocales) ? r.enabledLocales.filter(isLocale) : null;
  return {
    storeName: typeof r.storeName === 'string' ? r.storeName : DEFAULT_STORE.storeName,
    supportEmail: typeof r.supportEmail === 'string' ? r.supportEmail : DEFAULT_STORE.supportEmail,
    defaultLocale: isLocale(r.defaultLocale) ? r.defaultLocale : DEFAULT_STORE.defaultLocale,
    enabledLocales: enabled && enabled.length > 0 ? enabled : DEFAULT_STORE.enabledLocales,
  };
}

/** Localized notification templates from a raw stored `notifications` value,
 *  overlaid on the built-in defaults (E9; reused by the notifications sender). */
export function readNotifications(raw: unknown): NotificationsSection {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    orderPaid: mergeTemplate(DEFAULT_NOTIFICATIONS.orderPaid, r.orderPaid),
    warmingReady: mergeTemplate(DEFAULT_NOTIFICATIONS.warmingReady, r.warmingReady),
    ticketReply: mergeTemplate(DEFAULT_NOTIFICATIONS.ticketReply, r.ticketReply),
  };
}

/**
 * Assemble the typed ShopSettings from raw store rows + read-only integration
 * flags. Integration flags describe whether a secret is *configured* — the
 * secret itself never lives in the Setting store (docs/13 §17, security).
 */
export function buildSettings(
  rows: Record<string, unknown>,
  integrations: ShopSettings['integrations'],
): ShopSettings {
  const store = readStore(rows[SETTING_KEYS.store]);
  return {
    ...store,
    notifications: readNotifications(rows[SETTING_KEYS.notifications]),
    integrations,
  };
}

/**
 * Apply a partial update to the stored sections, returning the new raw values
 * to persist per key. `enabledLocales` is validated and must stay non-empty and
 * must contain `defaultLocale`.
 */
export function applyUpdate(
  rows: Record<string, unknown>,
  patch: UpdateSettingsRequest,
): { store: StoreSection; notifications: NotificationsSection; error?: string } {
  const store = readStore(rows[SETTING_KEYS.store]);
  const notifications = readNotifications(rows[SETTING_KEYS.notifications]);

  if (patch.storeName !== undefined) store.storeName = patch.storeName.trim();
  if (patch.supportEmail !== undefined) store.supportEmail = patch.supportEmail.trim();
  if (patch.defaultLocale !== undefined) store.defaultLocale = patch.defaultLocale;
  if (patch.enabledLocales !== undefined) {
    const cleaned = patch.enabledLocales.filter(isLocale);
    if (cleaned.length === 0) return { store, notifications, error: 'enabledLocales must be non-empty' };
    store.enabledLocales = [...new Set(cleaned)];
  }
  if (!store.enabledLocales.includes(store.defaultLocale)) {
    return { store, notifications, error: 'defaultLocale must be one of enabledLocales' };
  }

  if (patch.notifications) {
    for (const key of ['orderPaid', 'warmingReady', 'ticketReply'] as const) {
      if (patch.notifications[key]) {
        notifications[key] = mergeTemplate(notifications[key], patch.notifications[key]);
      }
    }
  }

  return { store, notifications };
}
