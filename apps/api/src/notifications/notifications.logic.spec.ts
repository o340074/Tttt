import { describe, expect, it } from 'vitest';
import { EVENT_TO_TYPE, renderPlaceholders, renderTemplate } from './notifications.logic';
import type { LocalizedNotificationTemplate } from '@advault/types';

describe('notifications.logic', () => {
  it('substitutes {{var}} placeholders and tolerates whitespace', () => {
    expect(renderPlaceholders('Order {{number}} paid', { number: 'AV-1' })).toBe('Order AV-1 paid');
    expect(renderPlaceholders('Order {{ number }}', { number: 'AV-2' })).toBe('Order AV-2');
  });

  it('leaves unknown placeholders verbatim', () => {
    expect(renderPlaceholders('Hi {{missing}}', { number: 'x' })).toBe('Hi {{missing}}');
  });

  const localized: LocalizedNotificationTemplate = {
    en: { subject: 'Ready {{number}}', body: 'Order {{number}} is ready' },
    ru: { subject: 'Готово {{number}}', body: 'Заказ {{number}} готов' },
  };

  it('renders in the recipient locale', () => {
    const out = renderTemplate(localized, 'ru', 'en', { number: 'AV-9' });
    expect(out.subject).toBe('Готово AV-9');
    expect(out.body).toBe('Заказ AV-9 готов');
  });

  it('falls back to the default locale, then EN, when a locale is absent', () => {
    const partial = { en: localized.en } as unknown as LocalizedNotificationTemplate;
    // ru missing → falls back to default 'en'
    const out = renderTemplate(partial, 'ru', 'en', { number: 'AV-3' });
    expect(out.subject).toBe('Ready AV-3');
  });

  it('maps every event to a stored notification type', () => {
    expect(EVENT_TO_TYPE.orderPaid).toBe('order_paid');
    expect(EVENT_TO_TYPE.warmingReady).toBe('warming_ready');
    expect(EVENT_TO_TYPE.ticketReply).toBe('ticket_reply');
  });
});
