import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Mirrors the pricing-engine's per-provider proxy flag.
 *
 * The engine owns the decision; this column exists so the panel can show and
 * edit it. Backfilled as `true` to match the engine's own backfill, which in
 * turn matches what the engine did before the flag existed: with a proxy
 * configured, everything but loopback, private ranges and docker service names
 * was tunnelled.
 */
export class ProviderUseProxyMig1000000000112 implements MigrationInterface {
  name = "ProviderUseProxyMig1000000000112";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "provider"
        ADD COLUMN IF NOT EXISTS "use_proxy" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provider" DROP COLUMN IF EXISTS "use_proxy"`);
  }
}
