import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { PERMISSION_KEYS, ROOT_ROLE_SLUG } from "../admin-role/permission.catalog";
import { AdminManagementService } from "./admin-management.service";

/**
 * The rule this file exists for: **an admin is never saved without a role.**
 *
 * `permissionsOf` reads `roleRef`, so a null `role_id` is not "unrestricted",
 * it is no permissions at all — a new super admin who logs in and finds every
 * screen refusing. `create` used to write only the legacy enum, and nothing
 * else set the column, so every account made after migration 097 was born that
 * way.
 */

const ROLES = [
  { id: "r-root", slug: ROOT_ROLE_SLUG, permissions: [] },
  { id: "r-admin", slug: "admin", permissions: ["dashboard", "roles_manage", "reports"] },
  { id: "r-finance", slug: "finance", permissions: ["dashboard", "reports"] },
  { id: "r-warehouse", slug: "warehouse", permissions: ["dashboard", "warehouse"] },
  { id: "r-custom", slug: "ops-desk", permissions: ["dashboard", "reports"] },
];

const caller = (permissions: string[], role = AdminRole.SUPER_ADMIN, id = "a-caller") =>
  ({ id, role, roleId: "r-caller", roleRef: { id: "r-caller", slug: "caller", permissions }, isSuspended: false }) as any;

const root = () => caller([...PERMISSION_KEYS], AdminRole.SUPER_ADMIN);

function build(existingAdmins: any[] = []) {
  const saved: any[] = [];
  const admins = {
    findOne: jest.fn(async ({ where }: any) =>
      existingAdmins.find((a) =>
        Object.entries(where).every(([k, v]) => a[k] === v),
      ) ?? null,
    ),
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => {
      saved.push(v);
      return { id: "a-new", ...v };
    }),
  };
  const schedules = { create: jest.fn((v: any) => v), save: jest.fn(async (v: any) => v) };
  const roles = {
    findOne: jest.fn(async ({ where }: any) =>
      ROLES.find((r) => (where.id ? r.id === where.id : r.slug === where.slug)) ?? null,
    ),
  };
  const service = new AdminManagementService(admins as any, schedules as any, roles as any);
  return { service, admins, roles, schedules, saved };
}

const dto = (over: Record<string, unknown> = {}) =>
  ({ phone: "09120000000", password: "secret123", role: AdminRole.ADMIN, ...over }) as any;

describe("create", () => {
  it("always assigns a role, so the new admin is not born with no permissions", async () => {
    const { service, saved } = build();
    await service.create(dto({ role: AdminRole.SUPER_ADMIN }), root());
    expect(saved[0].roleId).toBe("r-root");
    expect(saved[0].role).toBe(AdminRole.SUPER_ADMIN);
  });

  it("resolves the role row by the legacy slug — the join migration 097 used", async () => {
    const { service, saved } = build();
    await service.create(dto({ role: AdminRole.FINANCE }), root());
    expect(saved[0].roleId).toBe("r-finance");
  });

  it("takes an explicit roleId, the only way into a custom role", async () => {
    const { service, saved } = build();
    await service.create(dto({ role: AdminRole.ADMIN, roleId: "r-custom" }), root());
    expect(saved[0].roleId).toBe("r-custom");
    // A custom role has no enum value; the legacy column gets the weight its
    // permissions justify, and never undefined.
    expect(saved[0].role).toBe(AdminRole.WAREHOUSE);
  });

  it("rejects an unknown roleId rather than saving a role-less admin", async () => {
    const { service, admins } = build();
    await expect(
      service.create(dto({ roleId: "11111111-1111-4111-8111-111111111111" }), root()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(admins.save).not.toHaveBeenCalled();
  });

  it("refuses to create an admin holding a permission the caller lacks", async () => {
    // Otherwise account creation is a way around the permission catalog.
    const { service, admins } = build();
    await expect(
      service.create(dto({ role: AdminRole.SUPER_ADMIN }), caller(["dashboard", "roles_manage"])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(admins.save).not.toHaveBeenCalled();
  });

  it("refuses to guess when neither role nor roleId is given", async () => {
    // A default here would hand out whatever role it named.
    const { service, admins } = build();
    await expect(service.create(dto({ role: undefined }), root())).rejects.toThrow(/ROLE_REQUIRED/);
    expect(admins.save).not.toHaveBeenCalled();
  });

  it("still rejects a duplicate phone before touching roles", async () => {
    const { service, roles } = build([{ phone: "09120000000" }]);
    await expect(service.create(dto(), root())).rejects.toThrow(/phone already exists/i);
    expect(roles.findOne).not.toHaveBeenCalled();
  });

  it("keeps creating the finance work schedule", async () => {
    const { service, schedules } = build();
    await service.create(dto({ role: AdminRole.FINANCE }), root());
    expect(schedules.save).toHaveBeenCalled();
  });
});

describe("update", () => {
  const target = (over: Record<string, unknown> = {}) =>
    ({ id: "a-2", phone: "09121111111", role: AdminRole.WAREHOUSE, roleId: "r-warehouse", ...over }) as any;

  it("moves role_id when the legacy role changes", async () => {
    const { service } = build([target()]);
    const updated = await service.update("a-2", { role: AdminRole.FINANCE } as any, root());
    expect(updated.roleId).toBe("r-finance");
    expect(updated.role).toBe(AdminRole.FINANCE);
  });

  it("moves into a custom role by id", async () => {
    const { service } = build([target()]);
    const updated = await service.update("a-2", { roleId: "r-custom" } as any, root());
    expect(updated.roleId).toBe("r-custom");
  });

  it("refuses to move someone into a role the caller could not grant", async () => {
    const { service } = build([target()]);
    await expect(
      service.update("a-2", { role: AdminRole.SUPER_ADMIN } as any, caller(["dashboard", "roles_manage"])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("leaves the role alone when neither field is sent", async () => {
    const { service, roles } = build([target()]);
    await service.update("a-2", { email: "x@y.z" } as any, root());
    expect(roles.findOne).not.toHaveBeenCalled();
  });
});
