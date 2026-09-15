import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The record of attempts to log providers back in.
 *
 * Separate from the Redis counters that govern whether another attempt is
 * allowed: those forget after six hours by design, so that an old failure stops
 * holding a provider back. A record that forgets cannot answer why a provider
 * was down all night, which is the question somebody asks in the morning.
 */
export class ProviderLoginAttemptMig1000000000114 implements MigrationInterface {
  name = "ProviderLoginAttemptMig1000000000114";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provider_login_attempt" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "provider_key" character varying(100) NOT NULL,
        "device_name" character varying(100),
        "device_id" uuid,
        "outcome" character varying(20) NOT NULL DEFAULT 'started',
        "reason" text,
        "finished_at" TIMESTAMP WITH TIME ZONE,
        "attempt" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_provider_login_attempt" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_provider_login_attempt_provider_key"
        ON "provider_login_attempt" ("provider_key")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_provider_login_attempt_outcome"
        ON "provider_login_attempt" ("outcome")
    `);
    // The feed is always "most recent first", so the index that serves it is
    // the one on when it happened.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_provider_login_attempt_created_at"
        ON "provider_login_attempt" ("created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_login_attempt"`);
  }
}
