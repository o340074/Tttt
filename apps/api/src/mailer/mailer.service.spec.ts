import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailerService } from './mailer.service';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/** Minimal ConfigService stub returning a fixed env. */
function configFor(nodeEnv: Env['NODE_ENV']): ConfigService<Env, true> {
  return {
    get: (key: keyof Env) =>
      key === 'NODE_ENV' ? nodeEnv : 'http://localhost:5173',
  } as unknown as ConfigService<Env, true>;
}

describe('MailerService — secrets in logs (docs/09)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never logs verification/reset tokens in production', () => {
    const spy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const mailer = new MailerService(configFor('production'));

    mailer.sendEmailVerification('user@x.io', 'super-secret-token');
    mailer.sendPasswordReset('user@x.io', 'another-secret-token');

    const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('super-secret-token');
    expect(logged).not.toContain('another-secret-token');
    expect(logged).toContain('dispatched to user@x.io');
  });

  it('logs action links (with token) in dev for local testing', () => {
    const spy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const mailer = new MailerService(configFor('development'));

    mailer.sendEmailVerification('user@x.io', 'dev-token');

    const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('dev-token');
  });
});
