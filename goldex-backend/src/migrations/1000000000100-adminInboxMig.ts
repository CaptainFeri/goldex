import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The operators' inbox.
 *
 * Before this, admin alerts existed only as websocket broadcasts: an operator
 * who was not connected missed them, and there was no history. These tables
 * are what make them durable.
 *
 * Read state is its own table because an item is shared by the whole team —
 * storing `read_at` on the notification would let one operator clear the badge
 * for everyone. The unique index on (notification_id, admin_id) is what makes
 * "mark read" idempotent via ON CONFLICT DO NOTHING.
 */
export class AdminInboxMig1000000000100 implements MigrationInterface {
  name = "AdminInboxMig1000000000100";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_notifications_category_enum') THEN
          CREATE TYPE "admin_notifications_category_enum" AS ENUM
            ('withdrawal', 'deposit', 'kyc', 'arbitrage', 'user', 'system');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_notifications_severity_enum') THEN
          CREATE TYPE "admin_notifications_severity_enum" AS ENUM ('info', 'warning', 'urgent');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_notifications" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "updated_at"          timestamptz NOT NULL DEFAULT now(),
        "deleted_at"          timestamptz,
        "event"               varchar(80) NOT NULL,
        "category"            "admin_notifications_category_enum" NOT NULL DEFAULT 'system',
        "severity"            "admin_notifications_severity_enum" NOT NULL DEFAULT 'info',
        "title"               varchar(255) NOT NULL,
        "body"                text NOT NULL,
        "metadata"            jsonb,
        "required_permission" varchar(60)
      )
    `);
    // The inbox is always read newest-first and usually filtered; this is the
    // index that ordering actually uses.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_notifications_created_at"
        ON "admin_notifications" ("created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_notifications_category" ON "admin_notifications" ("category")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_notifications_severity" ON "admin_notifications" ("severity")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_notification_reads" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        "deleted_at"      timestamptz,
        "notification_id" uuid NOT NULL
                            REFERENCES "admin_notifications" ("id") ON DELETE CASCADE,
        "admin_id"        uuid NOT NULL REFERENCES "admin" ("id") ON DELETE CASCADE,
        "read_at"         timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_admin_notification_read"
        ON "admin_notification_reads" ("notification_id", "admin_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_notification_reads_admin"
        ON "admin_notification_reads" ("admin_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_notification_reads"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "admin_notifications_severity_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "admin_notifications_category_enum"`);
  }
}
