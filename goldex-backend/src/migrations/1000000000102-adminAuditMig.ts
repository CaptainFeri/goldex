import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The admin audit trail (§4.4).
 *
 * Append-only by convention: nothing writes an UPDATE or DELETE against this
 * table, and the module exposes no endpoint that could. A log the recorded
 * parties can amend is not evidence of anything.
 *
 * The indexes are the three questions actually asked of it — what did this
 * admin do, what happened to this record, and what happened recently.
 */
export class AdminAuditMig1000000000102 implements MigrationInterface {
  name = "AdminAuditMig1000000000102";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_audit_log" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now(),
        "deleted_at"       timestamptz,
        "admin_id"         uuid,
        "admin_label"      varchar(120),
        "permission"       varchar(120),
        "action"           varchar(200) NOT NULL,
        "entity"           varchar(120),
        "entity_id"        varchar(100),
        "before"           jsonb,
        "after"            jsonb,
        "otp_challenge_id" varchar(64),
        "status_code"      int,
        "error_message"    text,
        "ip"               varchar(64),
        "user_agent"       varchar(400),
        "duration_ms"      int
      )
    `);

    // Deliberately no foreign key to "admin": the log must survive the
    // deletion of the account it records, which is exactly when it matters.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_audit_admin_created"
        ON "admin_audit_log" ("admin_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_audit_entity"
        ON "admin_audit_log" ("entity", "entity_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_audit_created"
        ON "admin_audit_log" ("created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_audit_log"`);
  }
}
