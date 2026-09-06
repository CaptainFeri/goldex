import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The seed is written out literally rather than imported from the permission
 * catalog. A migration is a historical record: if the catalog gains a key next
 * year, an install seeded then must still receive exactly the rows an install
 * seeded today received, or the two environments quietly disagree about what
 * `admin` can do. Later changes to these sets belong in a later migration.
 */
export const SEED_ROLES: { slug: string; name: string; permissions: string[] }[] = [
  {
    slug: "superAdmin",
    name: "مدیر ارشد",
    // Left empty deliberately: the guard grants the root role the whole
    // catalog by definition and never reads this column.
    permissions: [],
  },
  {
    slug: "admin",
    name: "مدیر",
    // The whole catalog except `settings` and `api`, which stay with the root
    // role: they are the two keys that can reconfigure the install itself.
    permissions: [
      "dashboard", "users_view", "users_edit", "kyc_view", "kyc_approve", "roles_view", "roles_manage",
      "trades_view", "trades_manage", "wallets_view", "wallets_ops", "withdrawals_view",
      "withdrawals_approve", "price_engine", "arbitrage", "accounting", "reports", "providers",
      "warehouse", "monitoring",
    ],
  },
  {
    slug: "finance",
    name: "مالی",
    permissions: [
      "dashboard", "users_view", "trades_view", "wallets_view", "wallets_ops",
      "withdrawals_view", "withdrawals_approve", "accounting", "reports", "providers", "monitoring",
    ],
  },
  { slug: "warehouse", name: "انبار", permissions: ["dashboard", "warehouse", "users_view", "reports"] },
];

/**
 * Data-driven admin roles, replacing the four-value `AdminRole` enum.
 *
 * `admin.role_id` is added alongside the existing `role` column rather than
 * instead of it: that column is read in several places outside this change,
 * and dropping it here would break them. It stays as the legacy identity —
 * a varchar carrying the TypeScript enum's value, which is why the backfill
 * below can join it to `slug` directly — while the new column carries the
 * role a permission check actually reads.
 *
 * The seed writes each legacy role's equivalent permission set, so every
 * existing admin keeps exactly the access they had. That matters more than
 * usual here: until now the role decorators were never enforced (the guard read
 * a different metadata key than the decorator wrote, and looked for the admin
 * on a request property the middleware never sets), so this is the first
 * migration after which admin authorization is real.
 */
export class AdminRolesMig1000000000097 implements MigrationInterface {
  name = "AdminRolesMig1000000000097";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_roles" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz NOT NULL DEFAULT now(),
        "deleted_at"  timestamptz,
        "slug"        varchar(60) NOT NULL UNIQUE,
        "role_name"   varchar(120) NOT NULL,
        "is_fixed"    boolean NOT NULL DEFAULT false,
        "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "wallets"     jsonb NOT NULL DEFAULT '[]'::jsonb,
        "configs"     jsonb NOT NULL DEFAULT '{}'::jsonb,
        "pairs"       jsonb NOT NULL DEFAULT '[]'::jsonb,
        "max_credit"  numeric(20,8)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "admin" ADD COLUMN IF NOT EXISTS "role_id" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_role_id" ON "admin" ("role_id")
    `);

    for (const role of SEED_ROLES) {
      await queryRunner.query(
        `INSERT INTO "admin_roles" ("slug", "role_name", "is_fixed", "permissions")
           VALUES ($1, $2, true, $3::jsonb)
         ON CONFLICT ("slug") DO NOTHING`,
        [role.slug, role.name, JSON.stringify(role.permissions)],
      );
    }

    // Point every existing admin at the role matching the value they carry, so
    // nobody's access changes on deploy.
    await queryRunner.query(`
      UPDATE "admin" a
         SET "role_id" = r."id"
        FROM "admin_roles" r
       WHERE r."slug" = a."role"::text
         AND a."role_id" IS NULL
    `);

    // Postgres has no ADD CONSTRAINT IF NOT EXISTS, and the rest of this
    // migration is re-runnable; this keeps that true if it half-fails.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_admin_role') THEN
          ALTER TABLE "admin"
            ADD CONSTRAINT "fk_admin_role" FOREIGN KEY ("role_id")
            REFERENCES "admin_roles" ("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin" DROP CONSTRAINT IF EXISTS "fk_admin_role"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_admin_role_id"`);
    await queryRunner.query(`ALTER TABLE "admin" DROP COLUMN IF EXISTS "role_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_roles"`);
  }
}
