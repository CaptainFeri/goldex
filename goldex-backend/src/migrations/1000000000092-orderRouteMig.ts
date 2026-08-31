import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Records how an order's price was arrived at, so a bridged fill can be
 * reconstructed later.
 *
 * `mesghal_price` keeps its existing meaning — the pure price per mesghal in
 * the pair's quote currency — because the resolver composes bridged prices in
 * the pair's own units. These columns say where that number came from, they do
 * not change what it means, so settlement and credit re-pricing are unaffected.
 */
export class OrderRouteMig1000000000092 implements MigrationInterface {
  name = "OrderRouteMig1000000000092";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order"
        ADD COLUMN IF NOT EXISTS "route_mode" character varying(10),
        ADD COLUMN IF NOT EXISTS "bridge_symbol_id" uuid,
        ADD COLUMN IF NOT EXISTS "bridge_rate" numeric(24,12),
        ADD COLUMN IF NOT EXISTS "route_legs" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order"
        DROP COLUMN IF EXISTS "route_mode",
        DROP COLUMN IF EXISTS "bridge_symbol_id",
        DROP COLUMN IF EXISTS "bridge_rate",
        DROP COLUMN IF EXISTS "route_legs"
    `);
  }
}
