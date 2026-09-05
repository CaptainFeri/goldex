import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Step 1 of the IRR → IRT move: the symbol itself, plus the columns the ticker
 * and price-engine screens need.
 *
 * This migration deliberately does **not** touch balances. Converting the
 * symbol's identity and converting every amount denominated in it are separate
 * concerns with separate blast radii, so they get separate migrations and
 * separate verification. See `docs/PARSZARGAR-ADMIN-API-PLAN.md` §3.1.
 *
 * **Ship this together with the balance conversion.** Between the two, the
 * database is self-inconsistent: the seeded `XAU/IRR` pair becomes `XAU/IRT`
 * while its price is still the rial figure (74,626,865.67 rather than
 * 7,462,686.567). That window is only safe because the platform is in
 * maintenance mode for the pair of them — never deploy this migration on its
 * own.
 *
 * The symbol row is updated in place rather than deleted and re-inserted: its
 * id is a foreign key from `wallet`, `price_pairs`, `deposit`, `withdraw`,
 * `system_ledger`, `admin_bank_account`, `p2p_*`, `credit` and `user_level`, so
 * a new id would orphan every one of them.
 */
export class RialToTomanSymbolMig1000000000093 implements MigrationInterface {
  name = "RialToTomanSymbolMig1000000000093";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── The symbol's identity ────────────────────────────────
    await queryRunner.query(`
      UPDATE "symbol"
      SET "slug" = 'IRT',
          "name" = 'تومان ایران',
          "pic_path" = '/icons/irt.png'
      WHERE "slug" = 'IRR'
    `);

    // ── Free-text references to the old slug ─────────────────
    // These columns store the symbol as a string rather than an FK, so the
    // rename above does not reach them.
    await queryRunner.query(`
      UPDATE "provider_deal_snapshots" SET "base_symbol" = 'IRT' WHERE "base_symbol" = 'IRR'
    `);
    await queryRunner.query(`
      UPDATE "provider_deal_snapshots" SET "quote_symbol" = 'IRT' WHERE "quote_symbol" = 'IRR'
    `);
    await queryRunner.query(`
      UPDATE "provider_settlements" SET "symbol" = 'IRT' WHERE "symbol" = 'IRR'
    `);

    // `shahin_entries.currency` is intentionally left as IRR: it mirrors the
    // bank's own record, and the bank settles in rial (plan §3.2).

    // ── Ticker and price-instrument metadata ─────────────────
    // The panel pins its ticker in constants/prices.js and its instrument
    // catalogue in data/priceInstruments.js. Both become symbol rows; the
    // camelCase key the client already uses is carried here so neither file
    // has to be kept in sync by hand.
    await queryRunner.query(`
      ALTER TABLE "symbol"
        ADD COLUMN IF NOT EXISTS "ticker_key" varchar(64),
        ADD COLUMN IF NOT EXISTS "is_ticker" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "display_order" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "category" varchar(64)
    `);

    // Partial unique: many symbols legitimately have no ticker key.
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

    await queryRunner.query(`
      UPDATE "provider_settlements" SET "symbol" = 'IRR' WHERE "symbol" = 'IRT'
    `);
    await queryRunner.query(`
      UPDATE "provider_deal_snapshots" SET "quote_symbol" = 'IRR' WHERE "quote_symbol" = 'IRT'
    `);
    await queryRunner.query(`
      UPDATE "provider_deal_snapshots" SET "base_symbol" = 'IRR' WHERE "base_symbol" = 'IRT'
    `);

    await queryRunner.query(`
      UPDATE "symbol"
      SET "slug" = 'IRR',
          "name" = 'ریال ایران',
          "pic_path" = '/icons/irr.png'
      WHERE "slug" = 'IRT'
    `);
  }
}
