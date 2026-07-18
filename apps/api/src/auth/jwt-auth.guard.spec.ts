import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception';
import { makeFakeConfigService, makeFakeRedisService } from '../testing/fakes';
import { IS_PUBLIC_KEY } from './decorators';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from './token.service';
import type { ExecutionContext } from '@nestjs/common';
import type { RedisService } from '../redis/redis.service';

const user = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'g@a.dev',
  role: 'user' as const,
};

function makeContext(
  authorization?: string,
  isPublic = false,
): { ctx: ExecutionContext; request: { headers: Record<string, string>; user?: unknown } } {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const handler = (): void => undefined;
  if (isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  const ctx = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

describe('JwtAuthGuard', () => {
  let tokens: TokenService;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    tokens = new TokenService(
      new JwtService({}),
      makeFakeRedisService() as RedisService,
      makeFakeConfigService(),
    );
    guard = new JwtAuthGuard(tokens, new Reflector());
  });

  it('lets a valid bearer token through and attaches the payload', async () => {
    const pair = await tokens.issuePair(user);
    const { ctx, request } = makeContext(`Bearer ${pair.accessToken}`);
    expect(guard.canActivate(ctx)).toBe(true);
    expect((request.user as { sub: string }).sub).toBe(user.id);
  });

  it('rejects a missing token with UNAUTHORIZED', () => {
    const { ctx } = makeContext();
    expect(() => guard.canActivate(ctx)).toThrowError(ApiException);
  });

  it('rejects garbage and refresh-typed tokens', async () => {
    expect(() => guard.canActivate(makeContext('Bearer garbage').ctx)).toThrowError(ApiException);
    const pair = await tokens.issuePair(user);
    expect(() => guard.canActivate(makeContext(`Bearer ${pair.refreshToken}`).ctx)).toThrowError(
      ApiException,
    );
  });

  it('skips auth for @Public() routes', () => {
    const { ctx } = makeContext(undefined, true);
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
