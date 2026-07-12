import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.service';
import type { Env } from '../config/env';
import type { Role } from '@advault/types';

export interface AccessPayload {
  sub: string;
  email: string;
  role: Role;
  type: 'access';
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access TTL, seconds. */
  expiresIn: number;
}

const refreshKey = (userId: string, jti: string): string => `auth:rt:${userId}:${jti}`;
const sessionsKey = (userId: string): string => `auth:rtset:${userId}`;
const verifyKey = (token: string): string => `auth:verify:${token}`;
const resetKey = (token: string): string => `auth:reset:${token}`;

export const VERIFY_TOKEN_TTL = 24 * 3600;
export const RESET_TOKEN_TTL = 3600;

/**
 * JWT issuing + refresh-session bookkeeping in Redis
 * (docs/backend/prisma-schema.md: auth tokens live in Redis, not Postgres).
 * Refresh rotation: each refresh consumes the old jti and issues a new one;
 * a consumed/unknown jti is rejected (INVALID_TOKEN).
 */
@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  readonly accessTtl: number;
  readonly refreshTtl: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    config: ConfigService<Env, true>,
  ) {
    this.accessSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.refreshSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.accessTtl = config.get('JWT_ACCESS_TTL', { infer: true });
    this.refreshTtl = config.get('JWT_REFRESH_TTL', { infer: true });
  }

  async issuePair(user: { id: string; email: string; role: Role }): Promise<TokenPair> {
    const jti = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          type: 'access',
        } satisfies AccessPayload,
        { secret: this.accessSecret, expiresIn: this.accessTtl },
      ),
      this.jwt.signAsync({ sub: user.id, jti, type: 'refresh' } satisfies RefreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshTtl,
      }),
    ]);
    await this.redis.client
      .multi()
      .set(refreshKey(user.id, jti), '1', 'EX', this.refreshTtl)
      .sadd(sessionsKey(user.id), jti)
      .expire(sessionsKey(user.id), this.refreshTtl)
      .exec();
    return { accessToken, refreshToken, expiresIn: this.accessTtl };
  }

  verifyAccess(token: string): AccessPayload | null {
    try {
      const payload = this.jwt.verify<AccessPayload>(token, { secret: this.accessSecret });
      return payload.type === 'access' ? payload : null;
    } catch {
      return null;
    }
  }

  verifyRefresh(token: string): RefreshPayload | null {
    try {
      const payload = this.jwt.verify<RefreshPayload>(token, { secret: this.refreshSecret });
      return payload.type === 'refresh' ? payload : null;
    } catch {
      return null;
    }
  }

  /**
   * Atomically consumes a refresh session (DEL returns 0 for an already
   * consumed/revoked jti — replayed tokens are rejected).
   */
  async consumeRefreshSession(userId: string, jti: string): Promise<boolean> {
    const deleted = await this.redis.client.del(refreshKey(userId, jti));
    await this.redis.client.srem(sessionsKey(userId), jti);
    return deleted === 1;
  }

  /** Revokes every refresh session of the user (logout everywhere / password change). */
  async revokeAllSessions(userId: string): Promise<void> {
    const jtis = await this.redis.client.smembers(sessionsKey(userId));
    const keys = jtis.map((jti) => refreshKey(userId, jti));
    await this.redis.client.del(...keys, sessionsKey(userId));
  }

  // ---------- One-time email tokens ----------

  async createEmailVerifyToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.redis.client.set(verifyKey(token), userId, 'EX', VERIFY_TOKEN_TTL);
    return token;
  }

  async consumeEmailVerifyToken(token: string): Promise<string | null> {
    const key = verifyKey(token);
    const userId = await this.redis.client.get(key);
    if (userId) await this.redis.client.del(key);
    return userId;
  }

  async createPasswordResetToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.redis.client.set(resetKey(token), userId, 'EX', RESET_TOKEN_TTL);
    return token;
  }

  async consumePasswordResetToken(token: string): Promise<string | null> {
    const key = resetKey(token);
    const userId = await this.redis.client.get(key);
    if (userId) await this.redis.client.del(key);
    return userId;
  }
}
