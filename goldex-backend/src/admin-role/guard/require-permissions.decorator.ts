import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "../permission.catalog";

/**
 * Metadata key for {@link RequirePermissions}.
 *
 * Exported so the guard reads the same constant the decorator writes. The
 * previous role decorator set `"AdminRoles"` while its guard read `"roles"`,
 * which meant no route in the codebase was ever authorised — the guard found
 * no requirement and returned true. A shared constant makes that class of
 * mistake impossible to repeat silently.
 */
export const REQUIRED_PERMISSIONS = "admin:required-permissions";

/**
 * Declare what a route needs.
 *
 * Multiple keys are **all** required, not any: a route that both reads and
 * changes something should say so, and a caller holding only half of it should
 * not get through.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
