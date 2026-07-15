import type {
  LocalizedNotificationTemplate,
  Locale,
  NotificationTemplate,
  NotificationType,
} from '@advault/types';

/** The event keys that carry a template, mapped to the stored notification type. */
export const EVENT_TO_TYPE = {
  orderPaid: 'order_paid',
  warmingReady: 'warming_ready',
  ticketReply: 'ticket_reply',
} as const satisfies Record<string, NotificationType>;

export type NotificationEvent = keyof typeof EVENT_TO_TYPE;

/**
 * Substitute `{{var}}` placeholders (e.g. `{{number}}`) from `vars`. Unknown
 * placeholders are left verbatim; whitespace inside the braces is tolerated.
 */
export function renderPlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : match,
  );
}

/**
 * Pick the template for the recipient's locale, falling back to the default
 * locale and finally EN so a message is never blank for an under-translated
 * store, then render its placeholders.
 */
export function renderTemplate(
  localized: LocalizedNotificationTemplate,
  locale: Locale,
  defaultLocale: Locale,
  vars: Record<string, string>,
): { subject: string; body: string } {
  const chosen: NotificationTemplate =
    localized[locale] ?? localized[defaultLocale] ?? localized.en;
  return {
    subject: renderPlaceholders(chosen.subject, vars),
    body: renderPlaceholders(chosen.body, vars),
  };
}
