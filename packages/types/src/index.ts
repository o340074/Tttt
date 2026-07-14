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

/**
 * Access roles. `user` is a customer; the rest are staff (E8, docs/13):
 * `support` fields tickets and reads orders, `operator` runs the warming
 * workspace and inventory, `manager` oversees catalog/orders/finance, and
 * `admin` is the owner-level superset. Staff scopes are additive here — the
 * granular StaffUser entity can arrive later without breaking this contract.
 */
export type Role = 'user' | 'support' | 'operator' | 'manager' | 'admin';

/** Roles that may reach the admin/operator area at all (any non-customer). */
export const STAFF_ROLES: readonly Role[] = ['support', 'operator', 'manager', 'admin'];

/** True when a role is any staff role (not a plain customer). */
export function isStaffRole(role: Role): boolean {
  return role !== 'user';
}
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

// ---------- Cart & orders (E4) ----------

export type OrderStatus =
  'pending' | 'paid' | 'partially_delivered' | 'delivered' | 'cancelled' | 'refunded';

/**
 * Line delivery state (docs/14). READY_STOCK jumps pending→delivered;
 * MADE_TO_ORDER walks the warming stages and ends delivered, with
 * on_hold/failed branches and refunded as a terminal money-returned state.
 */
export type OrderItemDeliveryStatus =
  | 'pending'
  | 'awaiting_manual'
  | 'queued'
  | 'assigned'
  | 'in_progress'
  | 'qc'
  | 'ready'
  | 'on_hold'
  | 'failed'
  | 'delivered'
  | 'replaced'
  | 'refunded';

export type PromoType = 'percent' | 'fixed';

/** One cart line. Name and price are live (from the variant), not snapshots. */
export interface CartItem {
  id: string;
  variantId: string;
  sku: string;
  /** Localized "product · variant" display name. */
  name: string;
  productSlug: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  fulfillmentType: FulfillmentType;
  /** Current variant stock (READY_STOCK). */
  stockCount: number;
  /** ETA for MADE_TO_ORDER variants. */
  etaMinutes: number | null;
  /** false — the variant was deactivated; the line must be removed to checkout. */
  isActive: boolean;
  /** Product attributes (icon, geo, …) for rendering the row. */
  attributes: Record<string, unknown>;
}

/** GET /cart — the user's cart (1:1 with the user). */
export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: Money;
  currency: string;
}

/** POST /cart/items */
export interface AddCartItemRequest {
  variantId: string;
  quantity: number;
}

/** PATCH /cart/items/:id */
export interface UpdateCartItemRequest {
  quantity: number;
}

/** GET /promo-codes/:code — public part of a valid promo code (discount preview). */
export interface PromoCodePublic {
  code: string;
  type: PromoType;
  /** Percent (percent) or amount in the accounting currency (fixed). */
  value: Money;
}

/** POST /orders/checkout (requires the Idempotency-Key header). */
export interface CheckoutRequest {
  promoCode?: string;
}

/** Order line as returned inside Order (price/name/sku are purchase-time snapshots). */
export interface OrderItem {
  id: string;
  variantId: string;
  sku: string;
  /** Localized display name from the purchase-time snapshot. */
  name: string;
  quantity: number;
  unitPrice: Money;
  deliveryType: DeliveryType;
  deliveryStatus: OrderItemDeliveryStatus;
  /** Warming progress for MADE_TO_ORDER lines; null for READY_STOCK. */
  warming?: WarmingProgress | null;
}

/** GET /orders/:id and POST /orders/checkout response. */
export interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  subtotal: Money;
  discount: Money;
  total: Money;
  currency: string;
  /** Applied promo code, if any. */
  promoCode: string | null;
  items: OrderItem[];
  /** ISO 8601 date-time. */
  createdAt: string;
}

// ---------- Stock & delivery (E5) ----------

/** StockItem pool states (docs/backend/prisma-schema.md). */
export type StockStatus = 'available' | 'reserved' | 'sold';

/** How a Delivery came to be: instant from stock, by an operator, warmed to order (bundle), or a warranty replacement. */
export type DeliveryKind = 'auto' | 'manual' | 'warm' | 'replacement';

/**
 * GET /orders/:id/items/:itemId/delivery — decrypted delivery data.
 * Owner-only; every access is written to the audit log.
 */
export interface DeliveryPayload {
  orderItemId: string;
  type: DeliveryKind;
  /** Decrypted secret; one sold unit per line when quantity > 1. */
  payload: string;
  /** ISO 8601 date-time. */
  deliveredAt: string | null;
}

/** POST /admin/products/:id/variants/:variantId/stock/import (JSON body; text/plain is the raw-file alternative). */
export interface StockImportRequest {
  /** One stock unit per line; encrypted server-side before storage. */
  items: string[];
}

/** Import outcome; skipped counts empty lines and per-variant duplicates. */
export interface StockImportReport {
  added: number;
  skipped: number;
  /** Available pool size after the import (the variant's fresh stockCount). */
  stockCount: number;
}

// ---------- Warming / made-to-order (E6) ----------

/** Warming Job lifecycle (docs/12, docs/14, docs/15). */
export type WarmingJobStatus =
  | 'queued'
  | 'assigned'
  | 'in_progress'
  | 'qc'
  | 'ready'
  | 'delivered'
  | 'on_hold'
  | 'failed'
  | 'refunded';

/** One warming stage instance state. */
export type WarmingTaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped' | 'blocked';

/** Delivery bundle assembly state. */
export type BundleStatus = 'assembling' | 'qc' | 'ready' | 'delivered';

/** One stage of a warming job as shown to the buyer. */
export interface WarmingStageProgress {
  /** 0-based stage order. */
  order: number;
  name: string;
  status: WarmingTaskStatus;
}

/** Buyer-facing warming progress on an order item (docs/14). */
export interface WarmingProgress {
  status: WarmingJobStatus;
  /** ISO 8601 estimated delivery time, or null once delivered/refunded. */
  etaAt: string | null;
  /** 1-based index of the stage in progress (0 before work starts). */
  currentStage: number;
  totalStages: number;
  stages: WarmingStageProgress[];
}

// ---------- Warming operator surface (E6, RBAC admin/support) ----------

/** GET /admin/warming/jobs — one row in the operator queue. */
export interface WarmingJobSummary {
  id: string;
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  sku: string;
  /** Localized item name from the order snapshot. */
  name: string;
  goal: string | null;
  tier: string | null;
  status: WarmingJobStatus;
  assignedTo: string | null;
  etaAt: string | null;
  slaDueAt: string | null;
  currentStage: number;
  stageCount: number;
  createdAt: string;
}

/** One task inside a warming job (operator view). */
export interface WarmingTaskView {
  id: string;
  order: number;
  name: string;
  expectedMinutes: number;
  status: WarmingTaskStatus;
  checklistState: Record<string, unknown>;
  startedAt: string | null;
  doneAt: string | null;
}

/** GET /admin/warming/jobs/:id — full operator detail. */
export interface WarmingJobDetail extends WarmingJobSummary {
  planId: string | null;
  planVersion: number;
  notes: string | null;
  /** Whether encrypted account data has been captured (never the data itself). */
  hasAccountAsset: boolean;
  bundleStatus: BundleStatus | null;
  tasks: WarmingTaskView[];
}

/** POST /admin/warming/jobs/:id/assign */
export interface AssignWarmingJobRequest {
  /** Operator (User with role support/admin). */
  operatorId: string;
}

/** Non-money status moves an operator can drive on a warming job. */
export type WarmingJobAction = 'start' | 'hold' | 'resume' | 'qc' | 'ready' | 'deliver' | 'fail';

/** POST /admin/warming/jobs/:id/transition */
export interface WarmingTransitionRequest {
  action: WarmingJobAction;
  /** Optional operator note (e.g. reason for hold/fail); stored, never a secret. */
  note?: string;
}

/** POST /admin/warming/jobs/:id/tasks/:taskId */
export interface UpdateWarmingTaskRequest {
  status?: WarmingTaskStatus;
  checklistState?: Record<string, unknown>;
}

/** POST /admin/warming/jobs/:id/account — encrypted server-side, never logged. */
export interface SetAccountAssetRequest {
  /** Login/password and related data — one secret per line, plaintext in transit only. */
  payload: string;
  recovery?: string;
  meta?: Record<string, unknown>;
}

/** How a `failed` job is resolved (operator's choice, docs/14). */
export type WarmingFailResolution = 'reassign' | 'refund';

/** POST /admin/warming/jobs/:id/resolve */
export interface ResolveWarmingJobRequest {
  resolution: WarmingFailResolution;
  reason?: string;
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

// ---------- Inventory: proxies & Octo profiles (E7, RBAC admin/support) ----------
//
// The platform only records resources and their bindings to warming jobs;
// provisioning (buying proxies, creating Octo profiles) is manual operator
// work outside the code (platform boundary, docs/09). Credentials/exportRef
// are encrypted server-side and never returned by the inventory endpoints —
// they surface only in the owner's Vault when a bundle is delivered.

/** Proxy kinds in the inventory pool (docs/12). */
export type ProxyType = 'residential' | 'mobile' | 'isp' | 'datacenter';

/** Proxy lifecycle in the pool. */
export type ProxyStatus = 'available' | 'assigned' | 'expired' | 'disabled';

/** Octo antidetect-profile registry state. */
export type OctoProfileStatus = 'draft' | 'ready' | 'delivered';

/** A proxy row as shown to operators — never carries the decrypted credentials. */
export interface ProxyItemView {
  id: string;
  type: ProxyType;
  geo: string;
  provider: string;
  status: ProxyStatus;
  /** ISO 8601 date-time, or null. */
  expiresAt: string | null;
  /** The warming job this proxy is bound to, or null when free. */
  assignedJobId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

/** An Octo profile row as shown to operators — never carries the decrypted exportRef. */
export interface OctoProfileView {
  id: string;
  externalId: string | null;
  name: string;
  status: OctoProfileStatus;
  /** Linked proxy (usually the job's proxy), or null. */
  proxyItemId: string | null;
  /** The warming job this profile is bound to, or null when free. */
  jobId: string | null;
  fingerprintRef: Record<string, unknown> | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

/** POST /admin/inventory/proxies — register a single proxy. */
export interface CreateProxyRequest {
  type: ProxyType;
  geo: string;
  provider: string;
  /** host:port:user:pass — encrypted server-side, never stored/returned in clear. */
  credentials: string;
  /** ISO 8601 date-time. */
  expiresAt?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * POST /admin/inventory/proxies/import — JSON body; text/plain is the raw-file
 * alternative (one proxy per line: `type,geo,provider,host:port:user:pass[,expiresAt]`).
 */
export interface ProxyImportRequest {
  items: CreateProxyRequest[];
}

/** Import outcome; skipped counts blanks, malformed lines and duplicates. */
export interface ProxyImportReport {
  added: number;
  skipped: number;
}

/** POST /admin/inventory/octo — register a single Octo profile. */
export interface CreateOctoProfileRequest {
  name: string;
  externalId?: string | null;
  proxyItemId?: string | null;
  /** Export/share reference — encrypted server-side, never stored/returned in clear. */
  exportRef?: string | null;
  fingerprintRef?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
}

/** PATCH /admin/inventory/octo/:id — edit registry fields (e.g. attach an export once ready). */
export interface UpdateOctoProfileRequest {
  name?: string;
  externalId?: string | null;
  proxyItemId?: string | null;
  status?: OctoProfileStatus;
  exportRef?: string | null;
  fingerprintRef?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
}

/** POST /admin/inventory/proxies/:id/bind — bind a free proxy to a warming job. */
export interface BindProxyRequest {
  jobId: string;
}

/** POST /admin/inventory/octo/:id/bind — bind a free profile to a warming job (optionally linking a proxy). */
export interface BindOctoProfileRequest {
  jobId: string;
  /** Proxy to link on the profile; defaults to the job's bound proxy. */
  proxyItemId?: string | null;
}

/** GET /admin/warming/jobs/:id/inventory — resources bound to a job (operator view). */
export interface JobInventory {
  proxy: ProxyItemView | null;
  octo: OctoProfileView | null;
}

// ---------- Admin: orders & stock (E8, RBAC staff) ----------
//
// The admin surface reads every buyer's orders and the stock pool (docs/13).
// Secrets are never exposed here — delivery payloads stay owner-only (E5).

/** Short buyer reference shown on admin order views. */
export interface OrderBuyer {
  id: string;
  email: string;
}

/** GET /admin/orders — one row in the admin orders table. */
export interface AdminOrderListItem {
  id: string;
  number: string;
  status: OrderStatus;
  buyer: OrderBuyer;
  /** Total quantity across the order's lines. */
  itemCount: number;
  total: Money;
  currency: string;
  createdAt: string;
}

/** GET /admin/orders/:id — full admin order detail (no secrets). */
export interface AdminOrderDetail {
  id: string;
  number: string;
  status: OrderStatus;
  buyer: OrderBuyer;
  subtotal: Money;
  discount: Money;
  total: Money;
  currency: string;
  promoCode: string | null;
  /** Lines with delivery status + warming progress (reuses the buyer shape). */
  items: OrderItem[];
  createdAt: string;
}

/** Free-text filter target and status filter for GET /admin/orders. */
export interface AdminOrderQuery {
  status?: OrderStatus;
  /** Matches order number or buyer email (case-insensitive, contains). */
  q?: string;
  page?: number;
  limit?: number;
}

/**
 * GET /admin/stock — one READY_STOCK variant with pool counts (docs/13).
 * Aggregated by variant; no payloads are ever returned.
 */
export interface AdminStockRow {
  productId: string;
  productSlug: string;
  variantId: string;
  sku: string;
  /** Localized "product · variant" name. */
  name: string;
  available: number;
  reserved: number;
  sold: number;
  total: number;
}
