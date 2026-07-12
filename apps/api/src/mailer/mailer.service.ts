import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/**
 * Email delivery stub (E1): real transport arrives with E9 (notifications).
 * Logs the action links so the full flow can be exercised locally.
 * Tokens are secrets — acceptable in dev logs only; the transport
 * implementation must not log them.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');
  private readonly webUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  sendEmailVerification(email: string, token: string): void {
    this.logger.log(
      `[stub] verification email to ${email}: ${this.webUrl}/auth/verify?token=${token}`,
    );
  }

  sendPasswordReset(email: string, token: string): void {
    this.logger.log(
      `[stub] password reset email to ${email}: ${this.webUrl}/auth/reset?token=${token}`,
    );
  }
}
