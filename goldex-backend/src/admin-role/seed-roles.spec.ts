import { SEED_ROLES } from "../migrations/1000000000097-adminRolesMig";
import { PERMISSION_KEYS, ROOT_ROLE_SLUG, isPermissionKey } from "./permission.catalog";

/**
 * The seed in migration 097 is written out literally, on purpose: a migration
 * is a historical record and must not change when the catalog does.
 *
 * That decoupling is what makes this test necessary. Nothing in the type system
 * connects the two any more, so a key can be misspelled or invented and the
 * migration will happily seed it — the guard would then never match it, and the
 * role would silently be missing access nobody notices until an operator is
 * refused. Written as a subset check rather than an equality one, so the
 * catalog can still grow without dragging this migration with it.
 */
/**
 * Catalog keys introduced after migration 097 was written.
 *
 * The migration is history and does not change, so a key added later is simply
 * absent from its seed — that is correct, not a gap. Listing them here keeps
 * the `admin` assertion meaningful (a key silently dropped from the seed still
 * fails) while letting the catalog grow.
 *
 * Adding a key here is a decision, not bookkeeping: it says existing installs
 * will not have it until someone grants it. `funding_self_approve` is
 * deliberately not seeded to `admin` — it lifts the four-eyes rule on manager
 * funding, and approval is a senior-admin action in any case.
 */
const ADDED_AFTER_097: string[] = ["funding_self_approve"];

describe("migration 097 seed", () => {
  it.each(SEED_ROLES.map((r) => [r.slug, r] as const))("%s seeds only real catalog keys", (_slug, role) => {
    const unknown = role.permissions.filter((p) => !isPermissionKey(p));
    expect(unknown).toEqual([]);
  });

  it("seeds no duplicate keys", () => {
    for (const role of SEED_ROLES) {
      expect(role.permissions).toEqual([...new Set(role.permissions)]);
    }
  });

  it("seeds the four legacy roles the backfill joins against", () => {
    // The backfill matches `admin.role` to `slug`, so these have to be exactly
    // the legacy AdminRole values or existing admins land with no role at all.
    expect(SEED_ROLES.map((r) => r.slug)).toEqual(["superAdmin", "admin", "finance", "warehouse"]);
  });

  it("leaves the root role's own set empty, since the guard grants it everything", () => {
    expect(SEED_ROLES.find((r) => r.slug === ROOT_ROLE_SLUG)!.permissions).toEqual([]);
  });

  it("keeps `settings` and `api` out of every non-root role", () => {
    for (const role of SEED_ROLES.filter((r) => r.slug !== ROOT_ROLE_SLUG)) {
      expect(role.permissions).not.toContain("settings");
      expect(role.permissions).not.toContain("api");
    }
  });

  it("gives `admin` everything the catalog held at 097, except those two", () => {
    const admin = SEED_ROLES.find((r) => r.slug === "admin")!;
    expect([...admin.permissions].sort()).toEqual(
      PERMISSION_KEYS.filter(
        (k) => k !== "settings" && k !== "api" && !ADDED_AFTER_097.includes(k),
      ).sort(),
    );
  });

  it("keeps roles_manage with at least one seeded role, or a fresh install is locked out", () => {
    const canManage = SEED_ROLES.filter(
      (r) => r.slug === ROOT_ROLE_SLUG || r.permissions.includes("roles_manage"),
    );
    expect(canManage.length).toBeGreaterThan(0);
  });
});
