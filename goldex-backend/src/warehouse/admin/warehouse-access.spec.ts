import { Reflector } from "@nestjs/core";
import { AdminWarehouseController } from "./admin-warehouse.controller";
import { AdminPermissionsGuard, permissionsOf } from "../../admin-role/guard/admin-permissions.guard";
import { REQUIRED_PERMISSIONS } from "../../admin-role/guard/require-permissions.decorator";
import { ROOT_ROLE_SLUG } from "../../admin-role/permission.catalog";
import { SEED_ROLES } from "../../migrations/1000000000097-adminRolesMig";

/**
 * Who may reach the warehouse API.
 *
 * Every route on it moves metal, credits a wallet or books an entry, so the
 * controller carries a permission rather than being open to any authenticated
 * admin as it was.
 */
describe("warehouse API access", () => {
  it("is gated on the warehouse permission", () => {
    const declared = new Reflector().get(REQUIRED_PERMISSIONS, AdminWarehouseController);
    expect(declared).toEqual(["warehouse"]);
  });

  it("is held by the super admin, the admin and the warehouse role, and nobody else", () => {
    // The set this was meant to be. A seed role that quietly gains `warehouse`
    // gains the ability to credit a wallet, so the list is asserted whole
    // rather than checked one role at a time.
    const holders = SEED_ROLES.filter(
      (role) => role.slug === ROOT_ROLE_SLUG || role.permissions.includes("warehouse"),
    ).map((role) => role.slug);

    expect(holders.sort()).toEqual(["admin", "superAdmin", "warehouse"]);
  });

  it("does not let the finance role in", () => {
    // Finance approves withdrawals and books entries but does not handle metal.
    const finance = SEED_ROLES.find((role) => role.slug === "finance")!;
    expect(finance.permissions).not.toContain("warehouse");
  });

  it("could not have been expressed with the legacy role enum", () => {
    // AdminRolesGuard takes Math.max of the required roles' ranks, so naming
    // superAdmin, admin and warehouse together would demand the highest of the
    // three and lock out the two below it. This is why the permission is used.
    const { RoleHierarchy, AdminRole } = require("../../admin/role/admin.roles.enum");
    const required = Math.max(
      RoleHierarchy[AdminRole.SUPER_ADMIN],
      RoleHierarchy[AdminRole.ADMIN],
      RoleHierarchy[AdminRole.WAREHOUSE],
    );
    expect(RoleHierarchy[AdminRole.WAREHOUSE]).toBeLessThan(required);
    expect(RoleHierarchy[AdminRole.ADMIN]).toBeLessThan(required);
  });
});

describe("the guard behind it", () => {
  const run = (admin: any) => {
    const reflector = { get: jest.fn((_key, target) => (target === "class" ? ["warehouse"] : undefined)) };
    const guard = new AdminPermissionsGuard(reflector as any);
    return guard.canActivate({
      getHandler: () => "handler",
      getClass: () => "class",
      switchToHttp: () => ({ getRequest: () => ({ admin }) }),
    } as any);
  };

  it("admits a warehouse operator", () => {
    expect(run({ roleRef: { slug: "warehouse", permissions: ["warehouse"] } })).toBe(true);
  });

  it("admits the super admin without reading a stored list", () => {
    // The root role holds the catalog by definition, so an unlucky edit to its
    // row cannot lock it out.
    expect(run({ roleRef: { slug: ROOT_ROLE_SLUG, permissions: [] } })).toBe(true);
  });

  it("refuses a role that does not hold it", () => {
    expect(() => run({ roleRef: { slug: "finance", permissions: ["accounting"] } })).toThrow();
  });

  it("refuses an admin with no role at all", () => {
    // "No role" is not "unrestricted".
    expect(() => run({ roleRef: null })).toThrow();
    expect(permissionsOf({ roleRef: null })).toEqual([]);
  });

  it("refuses a suspended admin whatever their role holds", () => {
    // A suspension that only stopped new logins would leave a live token working.
    expect(() => run({ isSuspended: true, roleRef: { slug: ROOT_ROLE_SLUG } })).toThrow();
  });
});
