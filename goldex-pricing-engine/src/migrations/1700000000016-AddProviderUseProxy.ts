import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets each provider declare whether its traffic goes through the outbound
 * proxy, instead of the proxy being one decision for the whole process.
 *
 * Backfilled as `true` because that is exactly what the engine did before:
 * with `PROXY_HOST` set, everything but loopback, private ranges and docker
 * service names was tunnelled. Those bypass rules still come first, so the
 * mocks are unaffected and no existing provider changes route on deploy.
 */
export class AddProviderUseProxy1700000000016 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "providers"
        ADD COLUMN IF NOT EXISTS "use_proxy" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN IF EXISTS "use_proxy"`);
  }
}
