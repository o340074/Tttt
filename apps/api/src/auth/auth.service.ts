import { Injectable, Logger } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import type { TokenPair } from './token.service';
import type { Locale, Role } from '@advault/types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mailer: MailerService,
  ) {}

  async register(email: string, password: string, locale?: Locale): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiException('EMAIL_ALREADY_USED', 'This email is already registered', 409);
    }
    const passwordHash = await this.passwords.hash(password);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, ...(locale ? { locale } : {}) },
    });
    await this.sendVerification(user.id, user.email);
    return this.tokens.issuePair({ id: user.id, email: user.email, role: user.role as Role });
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Hash check runs even for unknown emails would cost an extra hash; a plain
    // 401 without timing equalization is accepted for MVP.
    if (!user || !(await this.passwords.verify(user.passwordHash, password))) {
      throw new ApiException('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    this.assertNotBlocked(user);
    return this.tokens.issuePair({ id: user.id, email: user.email, role: user.role as Role });
  }

  async refresh(refreshToken: string | undefined): Promise<TokenPair> {
    const payload = refreshToken ? this.tokens.verifyRefresh(refreshToken) : null;
    if (!payload) {
      throw new ApiException('INVALID_TOKEN', 'Refresh token is invalid or expired', 401);
    }
    const consumed = await this.tokens.consumeRefreshSession(payload.sub, payload.jti);
    if (!consumed) {
      // Replay of a rotated token — revoke the whole family as a precaution.
      await this.tokens.revokeAllSessions(payload.sub);
      throw new ApiException('INVALID_TOKEN', 'Refresh token has been revoked', 401);
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new ApiException('INVALID_TOKEN', 'Refresh token is invalid or expired', 401);
    }
    this.assertNotBlocked(user);
    return this.tokens.issuePair({ id: user.id, email: user.email, role: user.role as Role });
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    const payload = refreshToken ? this.tokens.verifyRefresh(refreshToken) : null;
    if (payload) await this.tokens.consumeRefreshSession(payload.sub, payload.jti);
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.tokens.consumeEmailVerifyToken(token);
    if (!userId) {
      throw new ApiException('INVALID_TOKEN', 'Verification token is invalid or expired', 400);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) return; // idempotent — no state to leak
    await this.sendVerification(user.id, user.email);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // 202 either way — never reveal whether the email exists.
      this.logger.log('Password reset requested for unknown email');
      return;
    }
    const token = await this.tokens.createPasswordResetToken(user.id);
    this.mailer.sendPasswordReset(user.email, token);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await this.tokens.consumePasswordResetToken(token);
    if (!userId) {
      throw new ApiException('INVALID_TOKEN', 'Reset token is invalid or expired', 400);
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    // New password invalidates every existing session.
    await this.tokens.revokeAllSessions(userId);
  }

  private assertNotBlocked(user: User): void {
    if (user.status === 'blocked') {
      throw new ApiException('FORBIDDEN', 'Account is blocked', 403);
    }
  }

  private async sendVerification(userId: string, email: string): Promise<void> {
    const token = await this.tokens.createEmailVerifyToken(userId);
    this.mailer.sendEmailVerification(email, token);
  }
}
