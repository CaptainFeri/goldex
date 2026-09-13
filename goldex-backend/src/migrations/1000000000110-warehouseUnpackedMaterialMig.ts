import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the `warehouse` inbox category, so gold that has been settled for but
 * not yet packed can reach the operator who has to pack it.
 *
 * Material received from a provider physically exists the moment the
 * settlement is recorded, but it is not yet a package and cannot be allocated
 * to anyone. Nothing told the warehouse it was waiting, and the settlement
 * balance never decreased when some of it was packed, so the pile was
 * invisible from both ends. Filing it under `system` alongside every other
 * background event would bury it.
 */
export class WarehouseUnpackedMaterialMig1000000000110 implements MigrationInterface {
  name = "WarehouseUnpackedMaterialMig1000000000110";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'admin_notifications_category_enum' AND e.enumlabel = 'warehouse'
        ) THEN
          ALTER TYPE "admin_notifications_category_enum" ADD VALUE 'warehouse';
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Items already filed under the new category move back to `system` rather
    // than being deleted: an operator's inbox history is not ours to discard.
    await queryRunner.query(
      `UPDATE "admin_notifications" SET "category" = 'system' WHERE "category" = 'warehouse'`
    );

    // Postgres cannot drop one enum label, so the type is rebuilt without it.
    await queryRunner.query(
      `ALTER TYPE "admin_notifications_category_enum" RENAME TO "admin_notifications_category_enum_old"`
    );
    await queryRunner.query(
      `CREATE TYPE "admin_notifications_category_enum" AS ENUM
         ('withdrawal', 'deposit', 'kyc', 'arbitrage', 'user', 'system')`
    );
    await queryRunner.query(`ALTER TABLE "admin_notifications" ALTER COLUMN "category" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "admin_notifications" ALTER COLUMN "category"
         TYPE "admin_notifications_category_enum"
         USING "category"::text::"admin_notifications_category_enum"`
    );
    await queryRunner.query(`ALTER TABLE "admin_notifications" ALTER COLUMN "category" SET DEFAULT 'system'`);
    await queryRunner.query(`DROP TYPE "admin_notifications_category_enum_old"`);
  }
}
