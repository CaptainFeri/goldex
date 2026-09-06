import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Per-admin preferences, install-wide settings, and a display name on `admin`.
 *
 * `platform_settings` is a one-row table. That is enforced with a unique index
 * on a column that is always true, rather than by convention: two rows here
 * would make "the platform settings" mean whichever the query happened to
 * return first, and that kind of bug only shows up in production.
 */
export class AdminSettingsMig1000000000098 implements MigrationInterface {
  name = "AdminSettingsMig1000000000098";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admin" ADD COLUMN IF NOT EXISTS "full_name" varchar(120)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_settings" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "updated_at"          timestamptz NOT NULL DEFAULT now(),
        "deleted_at"          timestamptz,
        "admin_id"            uuid NOT NULL UNIQUE
                                REFERENCES "admin" ("id") ON DELETE CASCADE,
        "two_factor"          boolean NOT NULL DEFAULT false,
        "biometric"           boolean NOT NULL DEFAULT false,
        "unknown_login_alert" boolean NOT NULL DEFAULT true,
        "trade_alerts"        boolean NOT NULL DEFAULT true,
        "daily_email_report"  boolean NOT NULL DEFAULT false,
        "system_alerts"       boolean NOT NULL DEFAULT true
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "platform_settings" (
        "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"             timestamptz NOT NULL DEFAULT now(),
        "updated_at"             timestamptz NOT NULL DEFAULT now(),
        "deleted_at"             timestamptz,
        "singleton"              boolean NOT NULL DEFAULT true,
        "display_currency"       varchar(16) NOT NULL DEFAULT 'TOMAN',
        "language"               varchar(8) NOT NULL DEFAULT 'fa',
        "timezone"               varchar(64) NOT NULL DEFAULT 'Asia/Tehran',
        "calendar"               varchar(16) NOT NULL DEFAULT 'jalali',
        "min_withdrawal"         numeric(20,8) NOT NULL DEFAULT 0,
        "default_profit_percent" numeric(6,3) NOT NULL DEFAULT 0
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_platform_settings_singleton"
        ON "platform_settings" ("singleton")
    `);

    // The defaults match what the panel showed as static text before this
    // change, so nothing appears to move on deploy.
    await queryRunner.query(`
      INSERT INTO "platform_settings" ("singleton") VALUES (true)
      ON CONFLICT ("singleton") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_platform_settings_singleton"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "platform_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_settings"`);
    await queryRunner.query(`ALTER TABLE "admin" DROP COLUMN IF EXISTS "full_name"`);
  }
}
