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
