import "reflect-metadata";
import { DataSource } from "typeorm";
import { AdminEntity } from "../admin/entity/admin.entity";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminManagementService } from "../admin-management/admin-management.service";
import { AdminScheduleEntity } from "../admin-schedule/entity/admin-schedule.entity";
import { AdminRoleService } from "./admin-role.service";
import { AdminRoleEntity } from "./entity/admin-role.entity";
import { permissionsOf } from "./guard/admin-permissions.guard";
import { PERMISSION_KEYS, ROOT_ROLE_SLUG } from "./permission.catalog";

/**
 * The bug, end to end, against the real seeded roles.
 *
 * A newly created super admin saw nothing: `create` wrote only the legacy
 * `role` enum, `role_id` stayed NULL, `permissionsOf` returned an empty list,
 * and the roles screen — which lists members by `role_id` — showed the account
 * under no role at all. Unit tests with a mocked role repository cannot catch
 * that, because the thing that was wrong was the row.
 *
 *   GOLDEX_DB_SPECS=1 npx jest src/admin-role/rbac-assignment.db.spec.ts
 */
const ENABLED = process.env.GOLDEX_DB_SPECS === "1";
const describeDb = ENABLED ? describe : describe.skip;

/** Phones this spec owns, so it never deletes a real account. */
const PHONE = "09120000001";
const PHONE_2 = "09120000002";

let ds: DataSource;
let mgmt: AdminManagementService;
let roleSvc: AdminRoleService;
let root: AdminEntity;

const reload = (id: string) =>
  ds.getRepository(AdminEntity).findOne({ where: { id }, relations: { roleRef: true } });

const roleBySlug = (slug: string) =>
  ds.getRepository(AdminRoleEntity).findOne({ where: { slug } });

beforeAll(async () => {
  if (!ENABLED) return;
  ds = new DataSource({
    type: "postgres",
    host: process.env.GOLDEX_AUTH_POSTGRES_URL ?? "/tmp",
    port: Number(process.env.GOLDEX_AUTH_POSTGRES_PORT ?? 5433),
    username: process.env.GOLDEX_AUTH_POSTGRES_USERNAME ?? "postgres",
    password: process.env.GOLDEX_AUTH_POSTGRES_PASSWORD ?? "postgres",
    database: process.env.GOLDEX_AUTH_POSTGRES_DBNAME ?? "base-db",
    entities: ["src/**/*.entity.ts"],
    synchronize: false,
  });
  await ds.initialize();

  mgmt = new AdminManagementService(
    ds.getRepository(AdminEntity) as any,
    ds.getRepository(AdminScheduleEntity) as any,
    ds.getRepository(AdminRoleEntity) as any,
  );
  roleSvc = new AdminRoleService(
    ds.getRepository(AdminRoleEntity) as any,
    ds.getRepository(AdminEntity) as any,
  );

  const rootRole = await roleBySlug(ROOT_ROLE_SLUG);
  expect(rootRole).toBeTruthy();
  const existing = await ds.getRepository(AdminEntity).findOne({
    where: { roleId: rootRole!.id },
    relations: { roleRef: true },
  });
  // The seeded super admin. Its absence means migration 003 or 097 did not run.
  expect(existing).toBeTruthy();
  root = existing!;
});

afterAll(async () => {
  if (!ENABLED) return;
  await ds.query(`DELETE FROM "admin" WHERE "phone" = ANY($1)`, [[PHONE, PHONE_2]]);
  await ds.destroy();
});

beforeEach(async () => {
  if (!ENABLED) return;
  await ds.query(`DELETE FROM "admin" WHERE "phone" = ANY($1)`, [[PHONE, PHONE_2]]);
});

describeDb("a newly created admin, against the seeded roles", () => {
  it("the seeded super admin holds the whole catalog", async () => {
    expect(permissionsOf(root as any)).toHaveLength(PERMISSION_KEYS.length);
  });

  it("a new super admin holds it too — the bug was that it held nothing", async () => {
    const created = await mgmt.create(
      { phone: PHONE, password: "secret123", role: AdminRole.SUPER_ADMIN } as any,
      root,
    );
    const saved = await reload(created.id);

    expect(saved!.roleId).toBeTruthy();
    expect(saved!.roleRef?.slug).toBe(ROOT_ROLE_SLUG);
    expect(permissionsOf(saved as any)).toHaveLength(PERMISSION_KEYS.length);
  });

  it("appears in the role's member list, which reads role_id", async () => {
    const created = await mgmt.create(
      { phone: PHONE, password: "secret123", role: AdminRole.SUPER_ADMIN } as any,
      root,
    );
    const rootRole = await roleBySlug(ROOT_ROLE_SLUG);
    const members = await roleSvc.members(rootRole!.id);
    expect(members.map((m) => m.id)).toContain(created.id);
  });

  it("a finance admin holds exactly what the finance role seeds", async () => {
    const created = await mgmt.create(
      { phone: PHONE, password: "secret123", role: AdminRole.FINANCE } as any,
      root,
    );
    const saved = await reload(created.id);
    const finance = await roleBySlug("finance");

    expect(saved!.roleId).toBe(finance!.id);
    expect(permissionsOf(saved as any).sort()).toEqual([...finance!.permissions].sort());
    expect(permissionsOf(saved as any)).not.toContain("settings");
  });
});

describeDb("moving an admin between roles", () => {
  it("assignMembers moves role_id, the legacy column and the permissions together", async () => {
    const created = await mgmt.create(
      { phone: PHONE, password: "secret123", role: AdminRole.SUPER_ADMIN } as any,
      root,
    );
    const warehouse = await roleBySlug("warehouse");

    await roleSvc.assignMembers(root, warehouse!.id, { adminIds: [created.id] });
    const moved = await reload(created.id);

    expect(moved!.roleId).toBe(warehouse!.id);
    expect(moved!.role).toBe(AdminRole.WAREHOUSE);
    expect(permissionsOf(moved as any).sort()).toEqual([...warehouse!.permissions].sort());

    const before = await roleSvc.members((await roleBySlug(ROOT_ROLE_SLUG))!.id);
    expect(before.map((m) => m.id)).not.toContain(created.id);
    expect((await roleSvc.members(warehouse!.id)).map((m) => m.id)).toContain(created.id);
  });

  it("a warehouse admin cannot promote anyone to super admin", async () => {
    const promoter = await mgmt.create(
      { phone: PHONE, password: "secret123", role: AdminRole.WAREHOUSE } as any,
      root,
    );
    const victim = await mgmt.create(
      { phone: PHONE_2, password: "secret123", role: AdminRole.WAREHOUSE } as any,
      root,
    );
    const caller = await reload(promoter.id);
    const rootRole = await roleBySlug(ROOT_ROLE_SLUG);

    await expect(
      roleSvc.assignMembers(caller!, rootRole!.id, { adminIds: [victim.id] }),
    ).rejects.toThrow(/CANNOT_GRANT_UNHELD/);

    await expect(
      mgmt.create({ phone: "09129999999", password: "secret123", role: AdminRole.SUPER_ADMIN } as any, caller!),
    ).rejects.toThrow(/CANNOT_GRANT_UNHELD/);
  });

  it("update moves an admin's role_id, not just the legacy column", async () => {
    const created = await mgmt.create(
      { phone: PHONE, password: "secret123", role: AdminRole.WAREHOUSE } as any,
      root,
    );
    await mgmt.update(created.id, { role: AdminRole.FINANCE } as any, root);

    const moved = await reload(created.id);
    expect(moved!.roleRef?.slug).toBe("finance");
    expect(moved!.role).toBe(AdminRole.FINANCE);
  });
});
