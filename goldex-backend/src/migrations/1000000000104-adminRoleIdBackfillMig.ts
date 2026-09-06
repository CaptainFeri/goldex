import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Repair `admin.role_id` for accounts created after migration 097.
 *
 * 097 added the column and backfilled every admin that existed at the time, so
 * the seeded super admin got one. Nothing set it afterwards:
 * `AdminManagementService.create` wrote only the legacy `role` enum, and there
 * was no endpoint to assign a role at all. Every account created since — a new
 * super admin included — was saved with `role_id` NULL.
 *
 * `permissionsOf` reads `roleRef`, so a NULL there is not "unrestricted", it is
 * **no permissions at all**: the new admin logs in, every gated screen refuses,
 * and the roles screen lists them under no role because membership is a
 * `role_id` lookup. That is the bug this repairs.
 *
 * The same join as 097, so an environment repaired here is indistinguishable
 * from one that was never broken. Only NULLs are touched: an admin deliberately
 * placed in a custom role has a `role_id` that does not match their legacy
 * `role`, and overwriting it would undo that.
 *
 * The service now resolves and writes `role_id` on every create and role
 * change, so this backfill is a one-time repair rather than a recurring sweep.
 */
export class AdminRoleIdBackfillMig1000000000104 implements MigrationInterface {
  name = "AdminRoleIdBackfillMig1000000000104";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "admin" a
         SET "role_id" = r."id"
        FROM "admin_roles" r
       WHERE r."slug" = a."role"::text
         AND a."role_id" IS NULL
         AND r."deleted_at" IS NULL
    `);
  }

  public async down(): Promise<void> {
    // Deliberately empty. Clearing `role_id` again would strip the permissions
    // of every account this repaired, and there is no way to tell the rows this
    // migration wrote from ones an operator assigned afterwards.
  }
}
