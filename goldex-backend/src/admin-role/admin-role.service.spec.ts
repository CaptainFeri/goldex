import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AdminRoleService } from "./admin-role.service";
import { PERMISSION_KEYS, ROOT_ROLE_SLUG } from "./permission.catalog";

/**
 * The three invariants, plus the config rules, exercised without a database.
 *
 * These are the rules that keep an install from locking itself out, so they are
 * worth testing at the level where they are actually decided — the service —
 * rather than only through a route.
 */

const role = (over: Record<string, unknown> = {}) =>
  ({
    id: "r-custom",
    slug: "custom",
    roleName: "نقش سفارشی",
    isFixed: false,
    permissions: ["dashboard", "roles_view", "roles_manage"],
    wallets: [],
    pairs: [],
    configs: {},
    maxCredit: null,
    createAt: new Date(),
    ...over,
  }) as any;

const rootRole = role({ id: "r-root", slug: ROOT_ROLE_SLUG, roleName: "مدیر ارشد", isFixed: true, permissions: [] });

/** An admin holding exactly `permissions`, through a role of their own. */
const admin = (permissions: string[], roleId = "r-caller") =>
  ({
    id: "a-1",
    roleId,
    roleRef: { id: roleId, slug: roleId === "r-root" ? ROOT_ROLE_SLUG : "caller", permissions },
    isSuspended: false,
  }) as any;

function build(rows: any[] = [role(), rootRole], adminRows: any[] = []) {
  const state = { rows: [...rows], nextId: 1 };
  const roles = {
    find: jest.fn(async () => state.rows),
    findOne: jest.fn(async ({ where, withDeleted }: any) =>
      state.rows
        // Soft delete, as the real repository does it: the row stays and the
        // unique index still holds its slug.
        .filter((r) => withDeleted || !r.deletedAt)
        .find((r) => (where.id ? r.id === where.id : r.slug === where.slug)) ?? null,
    ),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => {
      const next = { ...v, id: v.id ?? `r-new-${state.nextId++}`, createAt: v.createAt ?? new Date() };
      const at = state.rows.findIndex((r) => r.id === next.id);
      if (at >= 0) state.rows[at] = next;
      else state.rows.push(next);
      return next;
    }),
    softRemove: jest.fn(async (v: any) => {
      const row = state.rows.find((r) => r.id === v.id);
      if (row) row.deletedAt = new Date();
      return v;
    }),
  };
  /** `In(...)` unwrapped, so the mock filters the way the repository does. */
  const values = (v: any) => (v?._value !== undefined ? v._value : v);
  const matches = (a: any, where: any = {}) =>
    Object.entries(where).every(([key, raw]) => {
      const wanted = values(raw);
      return Array.isArray(wanted) ? wanted.includes(a[key]) : a[key] === wanted;
    });

  const admins = {
    // Honours `where`: assignMembers looks admins up by id and then asks who
    // is left holding roles_manage, and a mock that returned everything would
    // pass those checks no matter what the code did.
    find: jest.fn(async (opts: any = {}) => adminRows.filter((a) => matches(a, opts.where))),
    save: jest.fn(async (v: any) => v),
    count: jest.fn(async ({ where }: any) => {
      const wanted = where.roleId?._value ?? where.roleId;
      const ids = Array.isArray(wanted) ? wanted : [wanted];
      return adminRows.filter(
        (a) => ids.includes(a.roleId) && (where.isSuspended === undefined || a.isSuspended === where.isSuspended),
      ).length;
    }),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () =>
        [...new Set(adminRows.map((a) => a.roleId))].map((id) => ({
          roleId: id,
          count: String(adminRows.filter((a) => a.roleId === id).length),
        })),
      ),
    })),
  };
  return { service: new AdminRoleService(roles as any, admins as any), roles, admins, state };
}

describe("AdminRoleService invariants", () => {
  it("refuses to remove roles_manage from the caller's own role", async () => {
    // The caller stands on r-mine and tries to drop the permission that got
    // them to this screen.
    const mine = role({ id: "r-mine", permissions: ["dashboard", "roles_manage"] });
    const other = role({ id: "r-other", permissions: ["dashboard", "roles_manage"] });
    const { service } = build([mine, other], [{ roleId: "r-other", isSuspended: false }]);

    await expect(
      service.setPermissions(admin(["dashboard", "roles_manage"], "r-mine"), "r-mine", ["dashboard"]),
    ).rejects.toThrow(/CANNOT_REMOVE_OWN_ROLES_MANAGE/);
  });

  it("refuses to grant a permission the caller does not hold", async () => {
    const { service } = build();
    await expect(
      service.setPermissions(admin(["dashboard", "roles_manage"]), "r-custom", ["dashboard", "settings"]),
    ).rejects.toThrow(/CANNOT_GRANT_UNHELD:settings/);
  });

  it("refuses the write that would leave nobody able to manage roles", async () => {
    // r-custom is the only role with roles_manage that has an active member.
    const only = role({ id: "r-custom", permissions: ["dashboard", "roles_manage"] });
    const { service } = build(
      [only, role({ id: "r-plain", slug: "plain", permissions: ["dashboard"] })],
      [{ roleId: "r-custom", isSuspended: false }],
    );

    await expect(
      service.setPermissions(admin(["dashboard", "roles_manage"], "r-caller"), "r-custom", ["dashboard"]),
    ).rejects.toThrow(/LAST_ROLES_MANAGE/);
  });

  it("allows the same write once another active admin keeps roles_manage", async () => {
    const target = role({ id: "r-custom", permissions: ["dashboard", "roles_manage"] });
    const keeper = role({ id: "r-keeper", slug: "keeper", permissions: ["dashboard", "roles_manage"] });
    const { service } = build(
      [target, keeper],
      [
        { roleId: "r-custom", isSuspended: false },
        { roleId: "r-keeper", isSuspended: false },
      ],
    );

    const out = await service.setPermissions(admin(["dashboard", "roles_manage"], "r-caller"), "r-custom", [
      "dashboard",
    ]);
    expect(out.permissions).toEqual(["dashboard"]);
  });

  it("does not count a suspended admin as a keeper of roles_manage", async () => {
    const target = role({ id: "r-custom", permissions: ["dashboard", "roles_manage"] });
    const keeper = role({ id: "r-keeper", slug: "keeper", permissions: ["dashboard", "roles_manage"] });
    const { service } = build(
      [target, keeper],
      [
        { roleId: "r-custom", isSuspended: false },
        { roleId: "r-keeper", isSuspended: true },
      ],
    );

    await expect(
      service.setPermissions(admin(["dashboard", "roles_manage"], "r-caller"), "r-custom", ["dashboard"]),
    ).rejects.toThrow(/LAST_ROLES_MANAGE/);
  });

  it("treats the root role as a keeper without reading its stored permissions", async () => {
    // The root role's set is definitional — its `permissions` column is empty
    // and the guard grants it everything, so it must still count here.
    const target = role({ id: "r-custom", permissions: ["dashboard", "roles_manage"] });
    const { service } = build(
      [target, rootRole],
      [
        { roleId: "r-custom", isSuspended: false },
        { roleId: "r-root", isSuspended: false },
      ],
    );

    const out = await service.setPermissions(admin(["dashboard", "roles_manage"], "r-caller"), "r-custom", [
      "dashboard",
    ]);
    expect(out.permissions).toEqual(["dashboard"]);
  });

  it("leaves the root role itself immutable", async () => {
    const { service } = build();
    const root = admin([...PERMISSION_KEYS], "r-root");
    await expect(service.setPermissions(root, "r-root", ["dashboard"])).rejects.toThrow(/ROOT_IMMUTABLE/);
    await expect(service.update(root, "r-root", { roleName: "x" } as any)).rejects.toThrow(/ROOT_IMMUTABLE/);
  });

  it("rejects a key that is not in the catalog", async () => {
    const { service } = build();
    await expect(
      service.setPermissions(admin([...PERMISSION_KEYS]), "r-custom", ["dashboard", "make_me_root"]),
    ).rejects.toThrow(/UNKNOWN_PERMISSION:make_me_root/);
  });

  it("reports the root role's permissions as the whole catalog", async () => {
    const { service } = build();
    const dto = await service.findOne(admin([...PERMISSION_KEYS], "r-root"), "r-root");
    expect(dto.permissions).toEqual([...PERMISSION_KEYS]);
  });
});

describe("AdminRoleService writes", () => {
  it("generates the slug rather than taking one from the request", async () => {
    const { service, state } = build([]);
    const caller = admin([...PERMISSION_KEYS]);
    await service.create(caller, { roleName: "Ops Desk", permissions: ["dashboard"], slug: ROOT_ROLE_SLUG } as any);
    const created = state.rows.find((r) => r.roleName === "Ops Desk");
    expect(created.slug).toBe("ops-desk");
  });

  it("suffixes a colliding generated slug instead of overwriting", async () => {
    const { service, state } = build([role({ id: "r-1", slug: "ops-desk", roleName: "Ops Desk" })]);
    await service.create(admin([...PERMISSION_KEYS]), { roleName: "Ops Desk", permissions: [] } as any);
    expect(state.rows.map((r) => r.slug)).toContain("ops-desk-2");
  });

  it("does not hand back the slug of a soft-deleted role", async () => {
    // Deletion is soft, so the unique index still holds the old slug — reusing
    // it would fail at the database with a duplicate key.
    const { service, state } = build([]);
    const caller = admin([...PERMISSION_KEYS]);
    const first = await service.create(caller, { roleName: "Ops Desk", permissions: [] } as any);
    await service.remove(first.id);
    await service.create(caller, { roleName: "Ops Desk", permissions: [] } as any);
    expect(state.rows.map((r) => r.slug)).toEqual(["ops-desk", "ops-desk-2"]);
  });

  it("falls back to a usable slug when the name has no latin characters", async () => {
    const { service, state } = build([]);
    await service.create(admin([...PERMISSION_KEYS]), { roleName: "پشتیبانی", permissions: [] } as any);
    expect(state.rows[0].slug).toBe("role");
  });

  it("refuses to delete a role that still has members", async () => {
    const { service } = build([role()], [{ roleId: "r-custom", isSuspended: false }]);
    await expect(service.remove("r-custom")).rejects.toThrow(/HAS_MEMBERS/);
  });

  it("refuses to delete a fixed role", async () => {
    const { service } = build([role({ id: "r-fixed", isFixed: true })]);
    await expect(service.remove("r-fixed")).rejects.toThrow(/FIXED_CANNOT_DELETE/);
  });

  it("refuses to rename a fixed role but allows reconfiguring it", async () => {
    const fixed = role({ id: "r-fixed", slug: "finance", isFixed: true });
    const { service } = build([fixed]);
    const caller = admin([...PERMISSION_KEYS]);
    await expect(service.update(caller, "r-fixed", { roleName: "دیگر" } as any)).rejects.toThrow(
      /FIXED_CANNOT_RENAME/,
    );
    const out = await service.update(caller, "r-fixed", { wallets: ["GOLD"] } as any);
    expect(out.wallets).toEqual(["GOLD"]);
  });
});

describe("AdminRoleService configuration rules", () => {
  const caller = () => admin([...PERMISSION_KEYS]);
  const create = (over: Record<string, unknown>) =>
    build([]).service.create(caller(), { roleName: "Ops", permissions: [], ...over } as any);

  it("rejects a fee quoted to more than three decimals", async () => {
    await expect(create({ wallets: ["GOLD"], configs: { GOLD: { buyFee: "0.1234" } } })).rejects.toThrow(
      /FEE_TOO_PRECISE:GOLD.buyFee/,
    );
  });

  it("accepts a fee at exactly three decimals", async () => {
    await expect(create({ wallets: ["GOLD"], configs: { GOLD: { buyFee: "0.123" } } })).resolves.toBeDefined();
  });

  it("requires a credit ceiling once a wallet has credit enabled", async () => {
    await expect(create({ wallets: ["GOLD"], configs: { GOLD: { hasCredit: "yes" } } })).rejects.toThrow(
      /CREDIT_AMOUNT_REQUIRED:GOLD/,
    );
  });

  it("caps the credit ceiling", async () => {
    await expect(
      create({ wallets: ["GOLD"], configs: { GOLD: { hasCredit: "yes", creditAmount: "10000001" } } }),
    ).rejects.toThrow(/CREDIT_AMOUNT_EXCEEDED:GOLD/);
  });

  it("rejects configuration for a wallet the role does not hold", async () => {
    await expect(create({ wallets: ["GOLD"], configs: { SILVER: { buyFee: "0.1" } } })).rejects.toThrow(
      /CONFIG_FOR_UNSELECTED_WALLET:SILVER/,
    );
  });

  it("rejects an unsorted pair, so one pair cannot exist under two names", async () => {
    await expect(create({ wallets: ["GOLD", "CASH"], pairs: ["GOLD-CASH"] })).rejects.toThrow(
      /PAIR_NOT_SORTED:GOLD-CASH/,
    );
    await expect(create({ wallets: ["GOLD", "CASH"], pairs: ["CASH-GOLD"] })).resolves.toBeDefined();
  });

  it("rejects a pair naming a wallet outside the role's selection", async () => {
    await expect(create({ wallets: ["GOLD"], pairs: ["GOLD-SILVER"] })).rejects.toThrow(/PAIR_OUTSIDE_WALLETS/);
  });

  it("rejects a malformed pair", async () => {
    await expect(create({ wallets: ["GOLD"], pairs: ["GOLD"] })).rejects.toThrow(/MALFORMED_PAIR:GOLD/);
  });
});

describe("AdminRoleService capabilities", () => {
  it("reports what the server would actually allow, so the client can grey out the rest", async () => {
    const populated = role({ id: "r-custom" });
    const { service } = build([populated, rootRole], [{ roleId: "r-custom", isSuspended: false }]);
    const caller = admin([...PERMISSION_KEYS]);

    const [custom, root] = await service.list(caller);
    expect(custom.capabilities).toEqual({
      canDelete: false, // it has a member
      canRename: true,
      canEditPermissions: true,
      canEditConfig: true,
    });
    expect(root.capabilities.canEditPermissions).toBe(false);
  });

  it("gives a viewer without roles_manage no capabilities at all", async () => {
    const { service } = build();
    const [custom] = await service.list(admin(["dashboard", "roles_view"]));
    expect(Object.values(custom.capabilities).every((v) => v === false)).toBe(true);
  });
});

describe("AdminRoleService errors", () => {
  it("is a 403 for escalation and a 400 for an unknown key", async () => {
    // The distinction matters to the panel: one is a permission problem to show
    // the operator, the other is a bug to log.
    const { service } = build();
    await expect(service.setPermissions(admin(["dashboard"]), "r-custom", ["settings"])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.setPermissions(admin(["dashboard"]), "r-custom", ["nope"])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("AdminRoleService.assignMembers", () => {
  const target = (over: Record<string, unknown> = {}) =>
    role({ id: "r-target", slug: "ops-desk", permissions: ["dashboard", "reports"], ...over });

  const member = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    roleId: "r-plain",
    role: "warehouse",
    isSuspended: false,
    createAt: new Date(),
    ...over,
  });

  const keeper = role({ id: "r-keeper", slug: "keeper", permissions: ["dashboard", "roles_manage"] });

  it("moves the named admins into the role and reports them back", async () => {
    // a-1 is the caller, sitting in the role that keeps roles_manage alive.
    const rows = [member("a-1", { roleId: "r-keeper" }), member("a-2"), member("a-3"), member("a-9")];
    const { service, admins } = build([target(), keeper, rootRole], rows);

    const result = await service.assignMembers(
      admin(["dashboard", "reports", "roles_manage"], "r-keeper"),
      "r-target",
      { adminIds: ["a-2", "a-3"] },
    );

    expect(admins.save).toHaveBeenCalled();
    expect(rows.filter((r) => r.roleId === "r-target").map((r) => r.id)).toEqual(["a-2", "a-3"]);
    expect(result.map((m) => m.id).sort()).toEqual(["a-2", "a-3"]);
  });

  it("keeps the legacy role column in step, so hierarchy checks stay meaningful", async () => {
    // A stale or undefined `role` makes every RoleHierarchy comparison in
    // admin-management false, which lets anyone edit anyone.
    const rows = [member("a-1", { roleId: "r-keeper" }), member("a-2", { role: "superAdmin" })];
    const { service } = build([target(), keeper, rootRole], rows);

    await service.assignMembers(
      admin(["dashboard", "reports", "roles_manage"], "r-keeper"),
      "r-target",
      { adminIds: ["a-2"] },
    );
    expect(rows[1].role).toBe("warehouse");
  });

  it("refuses to put someone into a role granting a key the caller lacks", async () => {
    const { service, admins } = build([target({ permissions: ["dashboard", "settings"] }), keeper, rootRole], [member("a-2")]);

    await expect(
      service.assignMembers(admin(["dashboard", "roles_manage"], "r-keeper"), "r-target", {
        adminIds: ["a-2"],
      }),
    ).rejects.toThrow(/CANNOT_GRANT_UNHELD:settings/);
    expect(admins.save).not.toHaveBeenCalled();
  });

  it("refuses to hand out the root role to a caller who is not root", async () => {
    // Otherwise any holder of roles_manage mints a super admin and logs in.
    const { service } = build([target(), keeper, rootRole], [member("a-2")]);

    await expect(
      service.assignMembers(admin(["dashboard", "roles_manage"], "r-keeper"), "r-root", {
        adminIds: ["a-2"],
      }),
    ).rejects.toThrow(/CANNOT_GRANT_UNHELD/);
  });

  it("lets a root caller hand out the root role", async () => {
    const rows = [member("a-1", { roleId: "r-root" }), member("a-2")];
    const { service } = build([target(), keeper, rootRole], rows);

    await service.assignMembers(admin([...PERMISSION_KEYS], "r-root"), "r-root", { adminIds: ["a-2"] });
    expect(rows[1].roleId).toBe("r-root");
    expect(rows[1].role).toBe("superAdmin");
  });

  it("refuses to reassign the caller — a lock-out or a self-promotion", async () => {
    const { service } = build([target(), keeper, rootRole], [member("a-1")]);
    await expect(
      service.assignMembers(admin(["dashboard", "reports", "roles_manage"], "r-keeper"), "r-target", {
        adminIds: ["a-1"],
      }),
    ).rejects.toThrow(/CANNOT_REASSIGN_SELF/);
  });

  it("rejects an unknown admin id before moving any of them", async () => {
    const rows = [member("a-1", { roleId: "r-keeper" }), member("a-2")];
    const { service, admins } = build([target(), keeper, rootRole], rows);

    await expect(
      service.assignMembers(admin(["dashboard", "reports", "roles_manage"], "r-keeper"), "r-target", {
        adminIds: ["a-2", "a-ghost"],
      }),
    ).rejects.toThrow(/UNKNOWN_ADMIN:a-ghost/);
    expect(admins.save).not.toHaveBeenCalled();
    expect(rows[1].roleId).toBe("r-plain");
  });

  it("refuses the move that would leave nobody able to manage roles", async () => {
    // a-2 is the only active admin in the only role holding roles_manage.
    const rows = [member("a-2", { roleId: "r-keeper" })];
    const { service, admins } = build([target(), keeper], rows);

    await expect(
      service.assignMembers(admin(["dashboard", "reports", "roles_manage"], "r-other"), "r-target", {
        adminIds: ["a-2"],
      }),
    ).rejects.toThrow(/LAST_ROLES_MANAGE/);
    expect(admins.save).not.toHaveBeenCalled();
  });

  it("allows the move when another active manager remains", async () => {
    const rows = [member("a-2", { roleId: "r-keeper" }), member("a-3", { roleId: "r-keeper" })];
    const { service } = build([target(), keeper], rows);

    await service.assignMembers(admin(["dashboard", "reports", "roles_manage"], "r-other"), "r-target", {
      adminIds: ["a-2"],
    });
    expect(rows[0].roleId).toBe("r-target");
  });

  it("does not count a suspended manager as the one who keeps the lights on", async () => {
    const rows = [
      member("a-2", { roleId: "r-keeper" }),
      member("a-3", { roleId: "r-keeper", isSuspended: true }),
    ];
    const { service } = build([target(), keeper], rows);

    await expect(
      service.assignMembers(admin(["dashboard", "reports", "roles_manage"], "r-other"), "r-target", {
        adminIds: ["a-2"],
      }),
    ).rejects.toThrow(/LAST_ROLES_MANAGE/);
  });

  it("404s for a role that does not exist", async () => {
    const { service } = build([target(), keeper, rootRole], [member("a-1", { roleId: "r-root" }), member("a-2")]);
    await expect(
      service.assignMembers(admin([...PERMISSION_KEYS], "r-root"), "r-missing", { adminIds: ["a-2"] }),
    ).rejects.toThrow(/ROLE.NOT_FOUND|not found/i);
  });
});
