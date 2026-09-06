import { AdminRole } from "../admin/role/admin.roles.enum";
import { isLegacyRoleSlug, legacyRoleFor } from "./legacy-role";
import { ROOT_ROLE_SLUG } from "./permission.catalog";

const role = (slug: string, permissions: string[] = []) => ({ slug, permissions });

describe("isLegacyRoleSlug", () => {
  it("recognises the four migrated slugs", () => {
    for (const slug of ["superAdmin", "admin", "finance", "warehouse"]) {
      expect(isLegacyRoleSlug(slug)).toBe(true);
    }
  });

  it("rejects a generated slug", () => {
    expect(isLegacyRoleSlug("modir-mali")).toBe(false);
  });
});

describe("legacyRoleFor", () => {
  it("keeps a migrated role's own value — the join migration 097 backfilled on", () => {
    expect(legacyRoleFor(role(ROOT_ROLE_SLUG))).toBe(AdminRole.SUPER_ADMIN);
    expect(legacyRoleFor(role("admin"))).toBe(AdminRole.ADMIN);
    expect(legacyRoleFor(role("finance"))).toBe(AdminRole.FINANCE);
    expect(legacyRoleFor(role("warehouse"))).toBe(AdminRole.WAREHOUSE);
  });

  it("gives a custom role that manages roles the matching hierarchy weight", () => {
    expect(legacyRoleFor(role("ops-desk", ["dashboard", "roles_manage"]))).toBe(AdminRole.ADMIN);
  });

  it("gives every other custom role the lowest weight", () => {
    // It cannot then edit, suspend or delete another admin — which is the only
    // thing the legacy hierarchy still decides.
    expect(legacyRoleFor(role("ops-desk", ["dashboard", "reports"]))).toBe(AdminRole.WAREHOUSE);
  });

  it("never returns undefined, whatever the row looks like", () => {
    // `RoleHierarchy[undefined]` is undefined, and every comparison against it
    // is false — which lets anyone edit anyone.
    expect(legacyRoleFor({ slug: "x" } as any)).toBe(AdminRole.WAREHOUSE);
    expect(legacyRoleFor(role("x", []))).toBeDefined();
  });
});
