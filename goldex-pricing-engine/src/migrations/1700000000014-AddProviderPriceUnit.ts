import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records the currency unit each provider quotes in.
 *
 * Existing providers are backfilled as TOMAN because that is what the engine
 * assumed before this column existed — reading them as Rial would divide every
 * historical price by ten.
 */
export class AddProviderPriceUnit1700000000014 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "providers"
        ADD COLUMN IF NOT EXISTS "priceUnit" character varying(10) NOT NULL DEFAULT 'TOMAN'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN IF EXISTS "priceUnit"`);
  }
}
