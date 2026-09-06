import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The price engine screen (§5.13).
 *
 * Two small additions, and deliberately nothing else:
 *
 *  - `symbol.color` — the chart stroke for an instrument. Nullable, because the
 *    endpoints derive a stable hue from the slug when it is unset; requiring it
 *    would mean editing every symbol before a chart drew.
 *  - `price_engine_config` — a one-row table for the client refresh cadence,
 *    enforced by a unique index on a column that is always true, exactly like
 *    `platform_settings`. Two rows would make "the" engine config mean whichever
 *    the query returned first.
 *
 * What this migration does **not** do is seed the sixty instruments from the
 * panels' `data/priceInstruments.js`, which the plan's §5.13 asks for. That is
 * the same refusal migration 094 records, for the same reason:
 * `admin-user.service` creates a wallet per active symbol for every user it
 * creates, and `credit.service` enumerates active material symbols when opening
 * a facility — sixty display-only symbols would mean sixty junk wallets per
 * customer, forever, and would leak into the credit machinery. An instrument
 * also needs a pair and a provider mapping before it has a price at all, so the
 * seeded rows would render as a permanent row of blanks.
 *
 * The colours below are therefore only for the symbols that already exist and
 * are already flagged as instruments, matched by slug, and only where the
 * mapping to the reference list is unambiguous.
 */
export class PriceEngineMig1000000000103 implements MigrationInterface {
  name = "PriceEngineMig1000000000103";

  /**
   * Slug → colour, read off `ui-parszargar/src/data/priceInstruments.js`.
   *
   * XAU takes `goldOunce`'s colour — that entry is literally named
   * «انس طلا (XAU)», so the match is by identity rather than by guess. The
   * three currencies match their own entries. No other symbol is coloured here;
   * an unmatched one derives its hue from its slug, which is a better outcome
   * than a colour invented in a migration.
   */
  private static readonly COLORS: Array<[slug: string, color: string]> = [
    ["XAU", "#9A7B2C"],
    ["USD", "#3FB985"],
    ["EUR", "#5BA3D0"],
    ["AED", "#48C9B0"],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "symbol" ADD COLUMN IF NOT EXISTS "color" varchar(9)
    `);

    for (const [slug, color] of PriceEngineMig1000000000103.COLORS) {
      // COALESCE, so a colour the desk already chose is never overwritten.
      await queryRunner.query(
        `UPDATE "symbol"
            SET "color" = COALESCE("color", $1)
          WHERE "slug" = $2 AND "deleted_at" IS NULL`,
        [color, slug],
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "price_engine_config" (
        "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"           timestamptz NOT NULL DEFAULT now(),
        "updated_at"           timestamptz NOT NULL DEFAULT now(),
        "deleted_at"           timestamptz,
        "singleton"            boolean NOT NULL DEFAULT true,
        "refresh_interval_sec" integer NOT NULL DEFAULT 3
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_price_engine_config_singleton"
        ON "price_engine_config" ("singleton")
    `);

    // Three seconds: what the reference screen showed as static text
    // («به‌روزرسانی هر ۳ ثانیه») and what the ticker already polls at, so
    // nothing appears to move on deploy.
    await queryRunner.query(`
      INSERT INTO "price_engine_config" ("singleton", "refresh_interval_sec")
      VALUES (true, 3)
      ON CONFLICT ("singleton") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_price_engine_config_singleton"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_engine_config"`);
    // `color` is dropped whole: unlike `category` in migration 094 there is no
    // pre-existing value to protect — the column arrives with this migration.
    await queryRunner.query(`ALTER TABLE "symbol" DROP COLUMN IF EXISTS "color"`);
  }
}
