import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Accounting policy the admin controls at runtime — chiefly the "pricing
 * symbol" every figure on the accounting page is converted into at live
 * prices. Key/value so a new knob does not need another migration.
 *
 * No row is seeded: with no reference chosen the service reports in Rial,
 * which is the platform's own unit of account.
 */
export class AccountingSettingMig1000000000094 implements MigrationInterface {
  name = "AccountingSettingMig1000000000094";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "accounting_setting" (
        "key" character varying NOT NULL,
        "value_json" jsonb NOT NULL,
        "updated_by_admin_id" uuid,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_accounting_setting" PRIMARY KEY ("key")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "accounting_setting"`);
  }
}
