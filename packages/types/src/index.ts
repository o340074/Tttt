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

// ---------- Catalog (E2) ----------

/** How a variant is fulfilled: instant from stock or warmed to order. */
export type FulfillmentType = 'READY_STOCK' | 'MADE_TO_ORDER';

/** Snapshot of the fulfillment model kept on order items (auto ⇔ READY_STOCK). */
export type DeliveryType = 'auto' | 'manual';

/** Components a delivery bundle can include (docs/11). */
export type BundleComponentType =
  'ACCOUNT' | 'PROXY' | 'OCTO_PROFILE' | 'RECOVERY' | 'SECRETS' | 'GUIDE' | 'WARRANTY';

/** One bundle component with its parameters (geo, proxy kind, term, …). */
export interface BundleComponent {
  type: BundleComponentType;
  meta?: Record<string, unknown>;
}

/** GET /categories — localized category tree node. */
export interface Category {
  id: string;
  parentId: string | null;
  slug: string;
  position: number;
  name: string;
  /** Published products directly in this category (children not included). */
  productCount: number;
  children: Category[];
}

/** Variant (SKU) inside GET /products/:slug. */
export interface ProductVariant {
  id: string;
  sku: string;
  /** Localized variant name (attributes.name_<locale>, falls back to tier/sku). */
  name: string;
  price: Money;
  currency: string;
  deliveryType: DeliveryType;
  fulfillmentType: FulfillmentType;
  goal: string | null;
  tier: string | null;
  stockCount: number;
  etaMinutes: number | null;
  warrantyHours: number | null;
  bundle: BundleComponent[];
  isActive: boolean;
  attributes: Record<string, unknown>;
}

/** GET /products/:slug — localized product card with variants. */
export interface Product {
  id: string;
  categoryId: string;
  categorySlug: string;
  slug: string;
  status: 'draft' | 'published' | 'hidden';
  ratingAvg: string | null;
  name: string;
  description: string | null;
  attributes: Record<string, unknown>;
  variants: ProductVariant[];
}

/** GET /products — list card. */
export interface ProductListItem {
  id: string;
  slug: string;
  categoryId: string;
  categorySlug: string;
  name: string;
  ratingAvg: string | null;
  minPrice: Money;
  currency: string;
  fulfillmentTypes: FulfillmentType[];
  /** Total stock across READY_STOCK variants. */
  stockCount: number;
  /** Minimal ETA across MADE_TO_ORDER variants, if any. */
  etaMinutes: number | null;
  attributes: Record<string, unknown>;
}

/** Sort options for GET /products. */
export type ProductSort = 'price_asc' | 'price_desc' | 'rating' | 'newest';

// ---------- Wallet & top-ups (E3) ----------

export type LedgerDirection = 'credit' | 'debit';

/** What a ledger entry references (money movement source). */
export type LedgerRefType = 'topup' | 'order' | 'refund' | 'adjustment' | 'replacement';

export type TopUpStatus = 'pending' | 'paid' | 'expired' | 'failed';

/** Asset + network the customer pays with. */
export type TopUpAsset = 'USDT-TRC20' | 'USDT-ERC20' | 'BTC' | 'ETH';

/** One double-entry ledger movement (GET /wallet/transactions). */
export interface LedgerEntry {
  id: string;
  direction: LedgerDirection;
  /** Always positive; direction tells the sign. */
  amount: Money;
  /** Balance snapshot right after this entry was posted. */
  balanceAfter: Money;
  refType: LedgerRefType;
  refId: string;
  /** ISO 8601 date-time. */
  createdAt: string;
}

/** GET /wallet — balance plus the 5 most recent movements. */
export interface Wallet {
  balance: Money;
  currency: string;
  recent: LedgerEntry[];
}

/** POST /wallet/topups (requires the Idempotency-Key header). */
export interface CreateTopUpRequest {
  /** Amount to credit in the accounting currency (USD). Min 1.00, max 100000.00. */
  amount: Money;
  asset: TopUpAsset;
}

/** Top-up as returned by POST /wallet/topups and GET /wallet/topups/:id. */
export interface TopUp {
  id: string;
  provider: string;
  amount: Money;
  asset: TopUpAsset;
  status: TopUpStatus;
  paymentUrl: string | null;
  address: string | null;
  /** ISO 8601 date-time; pending payment window end. */
  expiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
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
