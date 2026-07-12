import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception';
import {
  makeFakeConfigService,
  makeFakePrismaService,
  makeFakeRedisService,
} from '../testing/fakes';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import type { MailerService } from '../mailer/mailer.service';
import type { RedisService } from '../redis/redis.service';

function makeMailer(): MailerService & { sent: { kind: string; email: string; token: string }[] } {
  const sent: { kind: string; email: string; token: string }[] = [];
  return {
    sent,
    sendEmailVerification: (email: string, token: string) =>
      sent.push({ kind: 'verify', email, token }),
    sendPasswordReset: (email: string, token: string) => sent.push({ kind: 'reset', email, token }),
  } as unknown as MailerService & { sent: { kind: string; email: string; token: string }[] };
}

async function expectApiError(
  promise: Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiException);
  expect((error as ApiException).code).toBe(code);
  expect((error as ApiException).getStatus()).toBe(status);
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let tokens: TokenService;
  let mailer: ReturnType<typeof makeMailer>;
  let service: AuthService;

  beforeEach(() => {
    prisma = makeFakePrismaService();
    tokens = new TokenService(
      new JwtService({}),
      makeFakeRedisService() as RedisService,
      makeFakeConfigService(),
    );
    mailer = makeMailer();
    service = new AuthService(prisma, new PasswordService(), tokens, mailer);
  });

  it('register creates the user, sends a verification email and returns tokens', async () => {
    const pair = await service.register('new@advault.dev', 'password-123', 'ru');
    expect(pair.accessToken).toBeTruthy();
    const user = await prisma.user.findUnique({ where: { email: 'new@advault.dev' } });
    expect(user).not.toBeNull();
    expect(user!.locale).toBe('ru');
    expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(mailer.sent).toEqual([
      expect.objectContaining({ kind: 'verify', email: 'new@advault.dev' }),
    ]);
  });

  it('register rejects a duplicate email with EMAIL_ALREADY_USED (409)', async () => {
    await service.register('dup@advault.dev', 'password-123');
    await expectApiError(
      service.register('dup@advault.dev', 'password-456'),
      'EMAIL_ALREADY_USED',
      409,
    );
  });

  it('login rejects wrong password and unknown email with INVALID_CREDENTIALS (401)', async () => {
    await service.register('who@advault.dev', 'password-123');
    await expectApiError(
      service.login('who@advault.dev', 'wrong-password'),
      'INVALID_CREDENTIALS',
      401,
    );
    await expectApiError(
      service.login('ghost@advault.dev', 'password-123'),
      'INVALID_CREDENTIALS',
      401,
    );
  });

  it('login rejects a blocked user with FORBIDDEN (403)', async () => {
    await service.register('blocked@advault.dev', 'password-123');
    const user = await prisma.user.findUnique({ where: { email: 'blocked@advault.dev' } });
    await prisma.user.update({ where: { id: user!.id }, data: { status: 'blocked' } });
    await expectApiError(service.login('blocked@advault.dev', 'password-123'), 'FORBIDDEN', 403);
  });

  it('refresh rotates the session; the previous refresh token is rejected on replay', async () => {
    await service.register('rotate@advault.dev', 'password-123');
    const first = await service.login('rotate@advault.dev', 'password-123');
    const second = await service.refresh(first.refreshToken);
    expect(second.accessToken).toBeTruthy();
    // Replaying the consumed token must fail — and revoke the family.
    await expectApiError(service.refresh(first.refreshToken), 'INVALID_TOKEN', 401);
    await expectApiError(service.refresh(second.refreshToken), 'INVALID_TOKEN', 401);
  });

  it('logout revokes the session so refresh stops working', async () => {
    await service.register('bye@advault.dev', 'password-123');
    const pair = await service.login('bye@advault.dev', 'password-123');
    await service.logout(pair.refreshToken);
    await expectApiError(service.refresh(pair.refreshToken), 'INVALID_TOKEN', 401);
  });

  it('verify-email marks the user verified once; the token is single-use', async () => {
    await service.register('verify@advault.dev', 'password-123');
    const token = mailer.sent[0]!.token;
    await service.verifyEmail(token);
    const user = await prisma.user.findUnique({ where: { email: 'verify@advault.dev' } });
    expect(user!.emailVerifiedAt).toBeInstanceOf(Date);
    await expectApiError(service.verifyEmail(token), 'INVALID_TOKEN', 400);
  });

  it('forgot-password stays silent for unknown emails and resets via a valid token', async () => {
    await service.register('reset@advault.dev', 'old-password-1');
    await expect(service.forgotPassword('nobody@advault.dev')).resolves.toBeUndefined();
    expect(mailer.sent.filter((m) => m.kind === 'reset')).toHaveLength(0);

    await service.forgotPassword('reset@advault.dev');
    const token = mailer.sent.find((m) => m.kind === 'reset')!.token;
    const session = await service.login('reset@advault.dev', 'old-password-1');
    await service.resetPassword(token, 'new-password-2');

    await expectApiError(
      service.login('reset@advault.dev', 'old-password-1'),
      'INVALID_CREDENTIALS',
      401,
    );
    await expect(service.login('reset@advault.dev', 'new-password-2')).resolves.toBeTruthy();
    // Reset revokes every pre-existing session.
    await expectApiError(service.refresh(session.refreshToken), 'INVALID_TOKEN', 401);
  });
});
