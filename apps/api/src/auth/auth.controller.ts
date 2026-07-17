import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { TokenService } from './token.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import type { AccessPayload, TokenPair } from './token.service';
import type { Env } from '../config/env';
import type { TokenResponse } from '@advault/types';

export const REFRESH_COOKIE = 'refreshToken';
// Scope the cookie to auth routes only — it is never needed elsewhere.
const REFRESH_COOKIE_PATH = '/api/v1/auth';

const MINUTE = 60_000;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly cookieSecure: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieSecure = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    const pair = await this.auth.register(dto.email, dto.password, dto.locale, dto.referralCode);
    return this.respondWithPair(res, pair);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    const pair = await this.auth.login(dto.email, dto.password);
    return this.respondWithPair(res, pair);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    try {
      const pair = await this.auth.refresh(this.readRefreshCookie(req));
      return this.respondWithPair(res, pair);
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.readRefreshCookie(req));
    this.clearRefreshCookie(res);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @HttpCode(200)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @Throttle({ default: { limit: 3, ttl: 5 * MINUTE } })
  @HttpCode(202)
  @Post('resend-verification')
  async resendVerification(@CurrentUser() user: AccessPayload): Promise<void> {
    await this.auth.resendVerification(user.sub);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 5 * MINUTE } })
  @HttpCode(202)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 5 * MINUTE } })
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
  }

  // ---------- cookie helpers ----------

  private respondWithPair(res: Response, pair: TokenPair): TokenResponse {
    res.cookie(REFRESH_COOKIE, pair.refreshToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.tokens.refreshTtl * 1000,
    });
    return { accessToken: pair.accessToken, expiresIn: pair.expiresIn, tokenType: 'Bearer' };
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  private readRefreshCookie(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  }
}
