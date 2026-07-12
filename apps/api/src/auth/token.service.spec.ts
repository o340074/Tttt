import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeFakeConfigService, makeFakeRedisService } from '../testing/fakes';
import { TokenService } from './token.service';
import type { RedisService } from '../redis/redis.service';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'u@a.dev',
  role: 'user' as const,
};

describe('TokenService — refresh rotation', () => {
  let redis: ReturnType<typeof makeFakeRedisService>;
  let service: TokenService;

  beforeEach(() => {
    redis = makeFakeRedisService();
    service = new TokenService(new JwtService({}), redis as RedisService, makeFakeConfigService());
  });

  it('issues an access/refresh pair with a stored session', async () => {
    const pair = await service.issuePair(user);
    expect(pair.expiresIn).toBe(900);
    const access = service.verifyAccess(pair.accessToken);
    expect(access?.sub).toBe(user.id);
    expect(access?.role).toBe('user');
    const refresh = service.verifyRefresh(pair.refreshToken);
    expect(refresh?.sub).toBe(user.id);
    expect(redis.client.store.has(`auth:rt:${user.id}:${refresh!.jti}`)).toBe(true);
  });

  it('rejects an access token where a refresh token is expected (and vice versa)', async () => {
    const pair = await service.issuePair(user);
    expect(service.verifyRefresh(pair.accessToken)).toBeNull();
    expect(service.verifyAccess(pair.refreshToken)).toBeNull();
    expect(service.verifyAccess('garbage')).toBeNull();
  });

  it('consumes a session exactly once — a replayed jti is rejected', async () => {
    const pair = await service.issuePair(user);
    const { jti } = service.verifyRefresh(pair.refreshToken)!;
    await expect(service.consumeRefreshSession(user.id, jti)).resolves.toBe(true);
    await expect(service.consumeRefreshSession(user.id, jti)).resolves.toBe(false);
  });

  it('revokeAllSessions invalidates every outstanding refresh session', async () => {
    const first = await service.issuePair(user);
    const second = await service.issuePair(user);
    await service.revokeAllSessions(user.id);
    for (const pair of [first, second]) {
      const { jti } = service.verifyRefresh(pair.refreshToken)!;
      await expect(service.consumeRefreshSession(user.id, jti)).resolves.toBe(false);
    }
  });

  it('one-time email tokens are single-use', async () => {
    const token = await service.createEmailVerifyToken(user.id);
    await expect(service.consumeEmailVerifyToken(token)).resolves.toBe(user.id);
    await expect(service.consumeEmailVerifyToken(token)).resolves.toBeNull();

    const reset = await service.createPasswordResetToken(user.id);
    await expect(service.consumePasswordResetToken(reset)).resolves.toBe(user.id);
    await expect(service.consumePasswordResetToken(reset)).resolves.toBeNull();
  });
});
