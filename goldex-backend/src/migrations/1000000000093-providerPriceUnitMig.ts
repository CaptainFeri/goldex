import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Records the currency unit each price provider quotes in.
 *
 * Rial and Toman differ by a factor of ten, so this is the difference between a
 * correct book and one that is out by an order of magnitude. Existing rows are
 * backfilled as TOMAN because that is what the pricing-engine assumed before
 * the column existed — reading them as Rial would divide every price by ten.
 */
export class ProviderPriceUnitMig1000000000093 implements MigrationInterface {
  name = "ProviderPriceUnitMig1000000000093";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "provider"
        ADD COLUMN IF NOT EXISTS "price_unit" character varying(10) NOT NULL DEFAULT 'TOMAN'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provider" DROP COLUMN IF EXISTS "price_unit"`);
  }
}
