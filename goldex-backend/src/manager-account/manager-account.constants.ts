import type { PermissionKey } from "../admin-role/permission.catalog";

/**
 * Lets a senior admin approve a funding request they raised themselves.
 *
 * Held by the root role by definition; grant it to another role only where a
 * second approver genuinely is not available, since it is the four-eyes rule
 * on money entering a manager's account.
 */
export const SELF_APPROVE_PERMISSION: PermissionKey = "funding_self_approve";
