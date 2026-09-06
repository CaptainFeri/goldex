import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * API keys and their hourly usage rollup.
 *
 * `key_hash` is a SHA-256 hex digest, not a bcrypt hash, and it is uniquely
 * indexed so authentication is one indexed lookup rather than a bcrypt compare
 * against every row. See the entity for why that is the right trade for
 * high-entropy tokens.
 *
 * Usage is counted per key per hour. The unique index on (api_key_id, bucket)
 * is what makes the recorder's upsert atomic — without it, two concurrent
 * requests in the same hour would each insert a row and the counts would split.
 */
export class ApiKeysMig1000000000099 implements MigrationInterface {
  name = "ApiKeysMig1000000000099";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'api_keys_status_enum') THEN
          CREATE TYPE "api_keys_status_enum" AS ENUM ('active', 'limited', 'revoked');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_keys" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "updated_at"    timestamptz NOT NULL DEFAULT now(),
        "deleted_at"    timestamptz,
        "name"          varchar(120) NOT NULL,
        "key_hash"      char(64) NOT NULL,
        "key_prefix"    varchar(16) NOT NULL,
        "last_four"     char(4) NOT NULL,
        "status"        "api_keys_status_enum" NOT NULL DEFAULT 'active',
        "monthly_quota" int,
        "created_by"    uuid REFERENCES "admin" ("id") ON DELETE SET NULL,
        "last_used_at"  timestamptz,
        "revoked_at"    timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_api_keys_key_hash" ON "api_keys" ("key_hash")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_key_usage" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now(),
        "deleted_at"        timestamptz,
        "api_key_id"        uuid NOT NULL REFERENCES "api_keys" ("id") ON DELETE CASCADE,
        "bucket"            timestamptz NOT NULL,
        "requests"          int NOT NULL DEFAULT 0,
        "errors"            int NOT NULL DEFAULT 0,
        "duration_ms_total" bigint NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_api_key_usage_key_bucket"
        ON "api_key_usage" ("api_key_id", "bucket")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_api_key_usage_bucket" ON "api_key_usage" ("bucket")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "api_key_usage"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "api_keys_status_enum"`);
  }
}
