import { Injectable } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import type { Locale, Role, User, UserStatus } from '@advault/types';

/** DB row → API User (docs/backend/openapi.md → components.schemas.User). */
export function toUserResponse(user: DbUser): User {
  return {
    id: user.id,
    email: user.email,
    role: user.role as Role,
    status: user.status as UserStatus,
    balance: user.balance.toFixed(2),
    currency: 'USD',
    locale: user.locale as Locale,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async getMe(userId: string): Promise<User> {
    return toUserResponse(await this.requireUser(userId));
  }

  async updateMe(userId: string, patch: { locale?: Locale }): Promise<User> {
    await this.requireUser(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { ...(patch.locale ? { locale: patch.locale } : {}) },
    });
    return toUserResponse(user);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.requireUser(userId);
    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw new ApiException('INVALID_CREDENTIALS', 'Current password is incorrect', 400);
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    // Password change invalidates every refresh session; the current access
    // token stays valid until expiry, then the client must log in again.
    await this.tokens.revokeAllSessions(userId);
  }

  private async requireUser(userId: string): Promise<DbUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiException('UNAUTHORIZED', 'User no longer exists', 401);
    if (user.status === 'blocked') throw new ApiException('FORBIDDEN', 'Account is blocked', 403);
    return user;
  }
}
