import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Credentials for handsets that log providers back in unattended.
 *
 * Only a hash of each secret is stored, so the table is not itself a set of
 * keys to the platform. The unique index on it is also the lookup path: a
 * presented token is hashed and found directly rather than by scanning.
 */
export class ProviderLoginDeviceMig1000000000113 implements MigrationInterface {
  name = "ProviderLoginDeviceMig1000000000113";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provider_login_device" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "name" character varying(100) NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "last_seen_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_by_admin_id" uuid,
        CONSTRAINT "PK_provider_login_device" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_provider_login_device_token_hash" UNIQUE ("token_hash")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_provider_login_device_token_hash"
        ON "provider_login_device" ("token_hash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_login_device"`);
  }
}
