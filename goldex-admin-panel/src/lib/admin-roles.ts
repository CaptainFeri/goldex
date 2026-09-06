/**
 * Reading an admin's role, now that a role is a row rather than an enum value.
 *
 * `admin.roleId` is the real link; `admin.role` is the legacy enum, still
 * written by the server to keep its hierarchy checks working. Both are present
 * on the wire, and they can disagree — a custom role has no enum value — so
 * everything on screen reads the row and falls back to the enum only when the
 * row cannot be found.
 */
import type { Admin, AdminRole, AdminRoleItem } from "../api/types";

/** The four migrated roles, for labelling an admin whose role row is missing. */
const LEGACY_LABELS: Record<AdminRole, string> = {
  superAdmin: "مدیر ارشد",
  admin: "مدیر",
  finance: "مالی",
  warehouse: "انبار",
};

/** Roles whose members keep a weekly work schedule. */
const SCHEDULED_SLUGS = new Set(["finance", "warehouse"]);

export function roleOf(
  roles: AdminRoleItem[] | undefined,
  admin: Pick<Admin, "roleId" | "role">,
): AdminRoleItem | null {
  const list = roles ?? [];
  if (admin.roleId) {
    const byId = list.find((r) => r.id === admin.roleId);
    if (byId) return byId;
  }
  // The legacy enum values *are* the four seeded slugs, which is the join
  // migration 097 used to backfill; matching on it keeps an account readable
  // while the roles query is still loading.
  return list.find((r) => r.slug === admin.role) ?? null;
}

export function roleLabelFor(
  roles: AdminRoleItem[] | undefined,
  admin: Pick<Admin, "roleId" | "role">,
): string {
  return roleOf(roles, admin)?.roleName ?? LEGACY_LABELS[admin.role] ?? admin.role ?? "—";
}

/** The gold badge is the root role, not the legacy enum value. */
export function isRootRole(role: AdminRoleItem | null | undefined): boolean {
  return role?.slug === "superAdmin";
}

export function needsSchedule(role: AdminRoleItem | null | undefined): boolean {
  return !!role && SCHEDULED_SLUGS.has(role.slug);
}

/**
 * The role a new account should start on.
 *
 * `admin` rather than the first row: the list is ordered fixed-roles-first, and
 * the first fixed role is the root one — a form that defaulted to it would make
 * every mis-click a super admin.
 */
export function defaultRoleId(roles: AdminRoleItem[] | undefined): string {
  const list = roles ?? [];
  return (list.find((r) => r.slug === "admin") ?? list.find((r) => r.slug !== "superAdmin") ?? list[0])?.id ?? "";
}
