import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Ticker and price-instrument metadata on `symbol`.
 *
 * The panels pin their ticker in `constants/prices.js` and their instrument
 * catalogue in `data/priceInstruments.js`. Both become symbol rows, and the
 * camelCase key the client already uses is carried here so neither file has to
 * be kept in sync by hand.
 *
 * Note on units: the platform stores **rial**, and toman is a display
 * convention owned by the panels — so there is no symbol rename here and no
 * balance conversion anywhere. See `docs/PARSZARGAR-ADMIN-API-PLAN.md` §3.1.
 */
export class SymbolTickerMetadataMig1000000000093 implements MigrationInterface {
  name = "SymbolTickerMetadataMig1000000000093";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "symbol"
        ADD COLUMN IF NOT EXISTS "ticker_key" varchar(64),
        ADD COLUMN IF NOT EXISTS "is_ticker" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "display_order" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "category" varchar(64)
    `);

    // Partial unique: most symbols legitimately have no ticker key.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_symbol_ticker_key"
        ON "symbol" ("ticker_key")
        WHERE "ticker_key" IS NOT NULL AND "deleted_at" IS NULL
    `);

    // Ordering the marquee and the instrument picker is a per-category read.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_symbol_ticker_order"
        ON "symbol" ("is_ticker", "display_order")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_symbol_ticker_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_symbol_ticker_key"`);
    await queryRunner.query(`
      ALTER TABLE "symbol"
        DROP COLUMN IF EXISTS "category",
        DROP COLUMN IF EXISTS "display_order",
        DROP COLUMN IF EXISTS "is_ticker",
        DROP COLUMN IF EXISTS "ticker_key"
    `);
  }
}
