import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/**
 * Email delivery stub (E1): real transport arrives with E9 (notifications).
 * In dev it logs the action links so the full flow can be exercised locally.
 * Tokens are secrets (docs/09 — «секреты никогда не в логи»): they are logged
 * ONLY outside production; in production the log records the action + recipient
 * without the token, and the real transport must never log them either.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');
  private readonly webUrl: string;
  private readonly isProduction: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.webUrl = config.get('WEB_URL', { infer: true });
    this.isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  sendEmailVerification(email: string, token: string): void {
    if (this.isProduction) {
      this.logger.log(`verification email dispatched to ${email}`);
      return;
    }
    this.logger.log(
      `[stub] verification email to ${email}: ${this.webUrl}/auth/verify?token=${token}`,
    );
  }

  sendPasswordReset(email: string, token: string): void {
    if (this.isProduction) {
      this.logger.log(`password reset email dispatched to ${email}`);
      return;
    }
    this.logger.log(
      `[stub] password reset email to ${email}: ${this.webUrl}/auth/reset?token=${token}`,
    );
  }

  /**
   * A transactional notification email (E9): rendered subject/body already
   * localized by the notifications sender. Stub logs the subject only — bodies
   * may quote user content, so they are not logged.
   */
  sendNotification(email: string, subject: string, _body: string): void {
    this.logger.log(`[stub] notification email to ${email}: ${subject}`);
  }
}
