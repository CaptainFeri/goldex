import { describe, expect, it } from "vitest";
import { defaultRoleId, isRootRole, needsSchedule, roleLabelFor, roleOf } from "./admin-roles";
import type { AdminRoleItem } from "../api/types";

const role = (id: string, slug: string, roleName: string): AdminRoleItem =>
  ({ id, slug, roleName, isFixed: true, permissions: [], memberCount: 0 }) as any;

const ROLES = [
  role("r-root", "superAdmin", "مدیر ارشد"),
  role("r-admin", "admin", "مدیر"),
  role("r-finance", "finance", "مالی"),
  role("r-warehouse", "warehouse", "انبار"),
  role("r-ops", "ops-desk", "میز عملیات"),
];

describe("roleOf", () => {
  it("resolves by roleId — the real link", () => {
    expect(roleOf(ROLES, { roleId: "r-ops", role: "warehouse" })?.slug).toBe("ops-desk");
  });

  it("falls back to the legacy enum while the roles query is still loading", () => {
    expect(roleOf(ROLES, { roleId: null, role: "finance" })?.id).toBe("r-finance");
  });

  it("prefers the row over the enum when they disagree", () => {
    // A custom role has no enum value, so the server writes the nearest one;
    // trusting it here would mislabel every custom-role admin.
    expect(roleOf(ROLES, { roleId: "r-ops", role: "warehouse" })?.roleName).toBe("میز عملیات");
  });

  it("returns null rather than guessing when neither resolves", () => {
    expect(roleOf(ROLES, { roleId: "r-gone", role: "nope" as any })).toBeNull();
    expect(roleOf(undefined, { roleId: "r-ops", role: "admin" })).toBeNull();
  });
});

describe("roleLabelFor", () => {
  it("uses the row's own name", () => {
    expect(roleLabelFor(ROLES, { roleId: "r-ops", role: "warehouse" })).toBe("میز عملیات");
  });

  it("labels a legacy value while the roles are loading", () => {
    expect(roleLabelFor(undefined, { roleId: null, role: "superAdmin" })).toBe("مدیر ارشد");
  });

  it("never renders an empty cell", () => {
    expect(roleLabelFor(undefined, { roleId: null, role: null as any })).toBe("—");
  });
});

describe("isRootRole", () => {
  it("is the root slug, not the legacy enum", () => {
    expect(isRootRole(ROLES[0])).toBe(true);
    expect(isRootRole(ROLES[4])).toBe(false);
    expect(isRootRole(null)).toBe(false);
  });
});

describe("needsSchedule", () => {
  it("is true for the two roles that keep work hours", () => {
    expect(needsSchedule(ROLES[2])).toBe(true);
    expect(needsSchedule(ROLES[3])).toBe(true);
  });

  it("is false for everything else, including a missing role", () => {
    expect(needsSchedule(ROLES[0])).toBe(false);
    expect(needsSchedule(ROLES[4])).toBe(false);
    expect(needsSchedule(null)).toBe(false);
  });
});

describe("defaultRoleId", () => {
  it("starts a new account on `admin`, never on the root role", () => {
    // The list is fixed-roles-first and the first fixed role is the root one —
    // defaulting to the first row would make every mis-click a super admin.
    expect(defaultRoleId(ROLES)).toBe("r-admin");
  });

  it("falls back to any non-root role when `admin` is gone", () => {
    expect(defaultRoleId([ROLES[0], ROLES[4]])).toBe("r-ops");
  });

  it("returns an empty string when there are no roles at all", () => {
    expect(defaultRoleId([])).toBe("");
    expect(defaultRoleId(undefined)).toBe("");
  });
});
