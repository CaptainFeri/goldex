import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Price routing: lets a pair be priced through a bridge symbol when the direct
 * quote is unavailable (or worse), e.g. XAU/IRR composed from XAU/USD × USD/IRR.
 *
 *  - routing_mode: AUTO (direct first, bridge as fallback) | DIRECT (never
 *    bridge) | BRIDGE (always bridge) | BEST (best usable price per side)
 *  - bridge_symbol_id: preferred bridge; NULL searches every eligible symbol
 *  - bridge_max_deviation_percent: refuse a bridged price that differs from a
 *    usable direct price by more than this, so one stale leg cannot poison the
 *    quote
 */
export class PairRoutingMig1000000000091 implements MigrationInterface {
  name = "PairRoutingMig1000000000091";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "price_pairs"
        ADD COLUMN IF NOT EXISTS "routing_mode" character varying(10) NOT NULL DEFAULT 'AUTO',
        ADD COLUMN IF NOT EXISTS "bridge_symbol_id" uuid,
        ADD COLUMN IF NOT EXISTS "bridge_max_deviation_percent" numeric(10,4)
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_price_pairs_bridge_symbol'
        ) THEN
          ALTER TABLE "price_pairs"
            ADD CONSTRAINT "FK_price_pairs_bridge_symbol"
            FOREIGN KEY ("bridge_symbol_id") REFERENCES "symbol"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_price_pairs_bridge_symbol"
        ON "price_pairs" ("bridge_symbol_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_price_pairs_bridge_symbol"`);
    await queryRunner.query(
      `ALTER TABLE "price_pairs" DROP CONSTRAINT IF EXISTS "FK_price_pairs_bridge_symbol"`,
    );
    await queryRunner.query(`
      ALTER TABLE "price_pairs"
        DROP COLUMN IF EXISTS "routing_mode",
        DROP COLUMN IF EXISTS "bridge_symbol_id",
        DROP COLUMN IF EXISTS "bridge_max_deviation_percent"
    `);
  }
}
