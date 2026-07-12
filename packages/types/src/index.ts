/**
 * Shared API contracts for AdVault.
 * Source of truth: docs/backend/openapi.md — update the contract first,
 * then mirror the change here.
 */

/** Supported UI/content locales. EN is the default. */
export type Locale = 'en' | 'ru';

/**
 * Monetary value as a string with two decimal places (e.g. "12.50").
 * Never use floats for money.
 */
export type Money = string;

/** GET /health — service liveness + dependency states. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  /** Seconds since process start. */
  uptime: number;
  /** ISO 8601 date-time. */
  timestamp: string;
  dependencies: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

/** Error codes returned in the ApiError envelope (docs/backend/openapi.md). */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_BALANCE'
  | 'OUT_OF_STOCK'
  | 'EMAIL_NOT_VERIFIED'
  | 'EMAIL_ALREADY_USED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_TOKEN'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_SIGNATURE'
  | 'REVIEW_NOT_ALLOWED'
  | 'PROMO_INVALID'
  | 'INTERNAL_ERROR';

/** Unified API error envelope. */
export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ---------- Auth & users (E1) ----------

export type Role = 'user' | 'support' | 'admin';
export type UserStatus = 'active' | 'blocked';

/** GET /me — current user profile. */
export interface User {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  balance: Money;
  currency: string;
  locale: Locale;
  /** ISO 8601 date-time or null until the email is verified. */
  emailVerifiedAt: string | null;
  /** ISO 8601 date-time. */
  createdAt: string;
}

/** POST /auth/register */
export interface RegisterRequest {
  email: string;
  password: string;
  locale?: Locale;
}

/** POST /auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}

/** POST /auth/{register,login,refresh} — refresh token travels in an HTTP-only cookie. */
export interface TokenResponse {
  accessToken: string;
  /** Access-token TTL in seconds. */
  expiresIn: number;
  tokenType?: 'Bearer';
}

/** POST /auth/verify-email */
export interface VerifyEmailRequest {
  token: string;
}

/** POST /auth/forgot-password */
export interface ForgotPasswordRequest {
  email: string;
}

/** POST /auth/reset-password */
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

/** PATCH /me */
export interface UpdateMeRequest {
  locale?: Locale;
}

/** POST /me/change-password */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Pagination metadata returned by list endpoints. */
export interface PageMeta {
  total: number;
  page: number;
  limit: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}
