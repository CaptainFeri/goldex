import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminRoleEntity } from "./entity/admin-role.entity";
import { ROOT_ROLE_SLUG } from "./permission.catalog";

/** The permission the legacy hierarchy still effectively gates. */
const ROLES_MANAGE = "roles_manage";

/** Is this slug one of the four values the legacy enum can hold? */
export function isLegacyRoleSlug(slug: string): slug is AdminRole {
  return (Object.values(AdminRole) as string[]).includes(slug);
}

/**
 * The value to write into the legacy `admin.role` column for a data-driven
 * role.
 *
 * Authorization reads `roleRef`, not this column — but `admin-management` still
 * compares `RoleHierarchy[admin.role]` to decide who may edit, suspend or
 * delete whom, and `RoleHierarchy[undefined]` is `undefined`, which makes every
 * one of those comparisons false and silently lets anyone through. So the
 * column must always hold a real value.
 *
 * The four migrated roles keep their own value: their slugs *are* the enum
 * values, which is what migration 097's backfill joined on.
 *
 * A custom role has no enum value, so one is derived from the single capability
 * that hierarchy actually still gates — managing other admins. A custom role
 * holding `roles_manage` can already rewrite any non-root role's permissions,
 * so denying it the matching hierarchy weight would be a distinction without a
 * difference; one without it gets the lowest weight, and cannot touch other
 * admins at all.
 */
export function legacyRoleFor(role: Pick<AdminRoleEntity, "slug" | "permissions">): AdminRole {
  if (role.slug === ROOT_ROLE_SLUG) return AdminRole.SUPER_ADMIN;
  if (isLegacyRoleSlug(role.slug)) return role.slug;
  return (role.permissions ?? []).includes(ROLES_MANAGE) ? AdminRole.ADMIN : AdminRole.WAREHOUSE;
}
