import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Report jobs, schedules and download records.
 *
 * `report_jobs.created_by` and `report_schedules.owner_id` are the whole of the
 * visibility rule — everyone sees their own, the root role sees all — so both
 * are NOT NULL and indexed alongside the column each list orders by.
 *
 * `report_downloads` is a table rather than a counter on the job because the
 * panel's headline figure is "downloads *this month*", which a counter cannot
 * answer, and because an export is the easiest bulk-exfiltration path in the
 * panel and should say who took it and when.
 */
export class ReportsMig1000000000095 implements MigrationInterface {
  name = "ReportsMig1000000000095";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "report_job_type_enum" AS ENUM ('trades', 'users', 'financial', 'withdrawals');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "report_job_format_enum" AS ENUM ('xlsx', 'csv');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "report_job_status_enum" AS ENUM ('pending', 'running', 'completed', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_jobs" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "updated_at"          timestamptz NOT NULL DEFAULT now(),
        "deleted_at"          timestamptz,
        "type"                "report_job_type_enum"   NOT NULL,
        "format"              "report_job_format_enum" NOT NULL,
        "from_date"           timestamptz,
        "to_date"             timestamptz,
        "status"              "report_job_status_enum" NOT NULL DEFAULT 'pending',
        "created_by"          uuid NOT NULL,
        "object_name"         varchar(512),
        "file_size"           bigint,
        "row_count"           integer,
        "artifact_expires_at" timestamptz,
        "artifact_expired"    boolean NOT NULL DEFAULT false,
        "started_at"          timestamptz,
        "completed_at"        timestamptz,
        "duration_ms"         integer,
        "error"               text,
        "schedule_id"         uuid
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_schedules" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        "deleted_at"      timestamptz,
        "owner_id"        uuid NOT NULL,
        "name"            varchar(120) NOT NULL,
        "type"            "report_job_type_enum"   NOT NULL,
        "format"          "report_job_format_enum" NOT NULL,
        "cron_expression" varchar(120) NOT NULL,
        "window_days"     integer NOT NULL DEFAULT 30,
        "is_active"       boolean NOT NULL DEFAULT true,
        "last_run_at"     timestamptz,
        "next_run_at"     timestamptz
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_downloads" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"     timestamptz NOT NULL DEFAULT now(),
        "updated_at"     timestamptz NOT NULL DEFAULT now(),
        "deleted_at"     timestamptz,
        "report_job_id"  uuid NOT NULL,
        "admin_id"       uuid NOT NULL,
        "downloaded_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_report_download_job" FOREIGN KEY ("report_job_id")
          REFERENCES "report_jobs" ("id") ON DELETE CASCADE
      )
    `);

    // The list is always "mine, newest first"; the sweep always wants pending.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_report_jobs_owner_created" ON "report_jobs" ("created_by", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_report_jobs_status" ON "report_jobs" ("status")`,
    );
    // The purge scans for live artefacts past their expiry, so index only those.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_report_jobs_expiry" ON "report_jobs" ("artifact_expires_at")
         WHERE "artifact_expired" = false AND "object_name" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_report_schedules_owner" ON "report_schedules" ("owner_id")`,
    );
    // "Downloads this month" is a range scan over this column.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_report_downloads_at" ON "report_downloads" ("downloaded_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_report_downloads_job" ON "report_downloads" ("report_job_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "report_downloads"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "report_schedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "report_jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "report_job_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "report_job_format_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "report_job_type_enum"`);
  }
}
