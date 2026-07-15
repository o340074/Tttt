import type { Role } from '@advault/types';

/**
 * Role groups for @Roles() on the admin/operator surface (docs/13). Kept in one
 * place so the RBAC of a whole module reads at a glance and stays consistent.
 * Roles are additive for MVP (a single User.role); a granular StaffUser can be
 * introduced later without touching call sites.
 */

/** Any non-customer role — the widest staff gate (shell access, dashboards). */
export const STAFF: Role[] = ['support', 'operator', 'manager', 'admin'];

/** The warming workspace: hands-on operators, support, and oversight. */
export const WARMING_STAFF: Role[] = ['operator', 'support', 'manager', 'admin'];

/** Proxy / Octo inventory: operators own it, managers/admins oversee. */
export const INVENTORY_STAFF: Role[] = ['operator', 'support', 'manager', 'admin'];

/** Orders + stock read surface: support/managers/admins. */
export const ORDERS_STAFF: Role[] = ['support', 'operator', 'manager', 'admin'];

/** Destructive / money-touching admin actions — narrowed to managers/admins. */
export const ELEVATED: Role[] = ['manager', 'admin'];

/** Finance surface (reconciliation, refunds, promo) — managers/admins. */
export const FINANCE_STAFF: Role[] = ['manager', 'admin'];

/**
 * Catalog & warming-plan management (docs/13 §5–6): editing what the shop sells
 * and how it is warmed is a merchandising decision — managers/admins only.
 * Operators run the warming they are handed; they do not author plans.
 */
export const CATALOG_STAFF: Role[] = ['manager', 'admin'];

/**
 * Support surface — tickets (docs/13 §13). Support owns the queue; managers and
 * admins oversee. Operators run warming and are intentionally left out: customer
 * correspondence is not their job.
 */
export const SUPPORT_STAFF: Role[] = ['support', 'manager', 'admin'];

/**
 * Reports / analytics / dashboard (docs/13 §1, §14): revenue, SLA, operator load
 * and refund shares are oversight data — managers/admins only.
 */
export const REPORTS_STAFF: Role[] = ['manager', 'admin'];

/**
 * Owner-level only: staff management and role changes (a manager must not be
 * able to escalate anyone — including themselves — to admin). See docs/13.
 */
export const ADMIN_ONLY: Role[] = ['admin'];
