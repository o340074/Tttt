import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorReporter } from './error-reporter';
import { makeFakeConfigService } from '../testing/fakes';

function reporter(dsn: string, release = ''): ErrorReporter {
  return new ErrorReporter(
    makeFakeConfigService({ SENTRY_DSN: dsn, SENTRY_RELEASE: release, NODE_ENV: 'production' }),
  );
}

describe('ErrorReporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is disabled and never calls fetch when DSN is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = reporter('');
    expect(r.enabled).toBe(false);
    await r.captureException(new Error('boom'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is disabled for a malformed DSN', () => {
    expect(reporter('not-a-url').enabled).toBe(false);
    expect(reporter('https://host/123').enabled).toBe(false); // no public key
    expect(reporter('https://key@host/').enabled).toBe(false); // no project id
  });

  it('posts a valid Sentry envelope to the parsed endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const r = reporter('https://pub123@o1.ingest.sentry.io/42', 'v1.2.3');
    expect(r.enabled).toBe(true);

    await r.captureException(new Error('kaboom'), {
      method: 'POST',
      path: '/api/v1/orders',
      statusCode: 500,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=pub123&sentry_version=7',
    );
    expect(init.method).toBe('POST');

    // Envelope = header \n item-header \n event, each a JSON line.
    const [headerLine, itemHeaderLine, eventLine] = String(init.body).trim().split('\n');
    expect(eventLine).toBeDefined();
    const header = JSON.parse(headerLine as string) as { event_id: string };
    const itemHeader = JSON.parse(itemHeaderLine as string) as { type: string };
    const event = JSON.parse(eventLine as string) as {
      event_id: string;
      release: string;
      environment: string;
      transaction: string;
      exception: { values: Array<{ type: string; value: string }> };
      tags: Record<string, string>;
    };
    expect(itemHeader.type).toBe('event');
    expect(header.event_id).toBe(event.event_id);
    expect(event.release).toBe('v1.2.3');
    expect(event.environment).toBe('production');
    expect(event.transaction).toBe('/api/v1/orders');
    expect(event.exception.values[0]).toMatchObject({ type: 'Error', value: 'kaboom' });
    expect(event.tags).toMatchObject({ method: 'POST', status_code: '500' });
  });

  it('swallows a fetch failure so reporting never breaks the request', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const r = reporter('https://pub@host/1');
    await expect(r.captureException(new Error('x'))).resolves.toBeUndefined();
  });
});
