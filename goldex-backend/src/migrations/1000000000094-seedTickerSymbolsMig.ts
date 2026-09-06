import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Flag the symbols that appear in the market ticker.
 *
 * The API plan §4.5 called for seeding all sixteen instruments from the
 * panels' `constants/prices.js` as symbol rows. **That must not be done**, and
 * this migration deliberately does not do it:
 *
 *   `admin-user.service.ts` generates "a zero-balance wallet per active symbol"
 *   for every user it creates, and `credit.service.ts` enumerates active
 *   material symbols when opening a facility. Sixteen display-only instruments
 *   added as active symbols would mean sixteen junk wallets per user, forever,
 *   and would leak into the credit machinery.
 *
 * A ticker entry also needs a price, and a price belongs to a pair quoted
 * through `provider_pair_mappings` — so a seeded symbol with no pair would show
 * a permanent blank. Only the symbols that genuinely exist and are quoted are
 * flagged here; the rest need a real pair and provider mapping first, and if
 * they are ever added as display-only symbols they must be `is_active = false`
 * for the reason above.
 *
 * `ticker_key` is set only where the mapping to the panels' own key is
 * unambiguous. XAU is global gold, not the local ۱۸/۲۴ عیار instruments, and
 * AED is not in the panels' list at all — both are left null rather than
 * guessed, since the key is what a client matches on.
 */
export class SeedTickerSymbolsMig1000000000094 implements MigrationInterface {
  name = "SeedTickerSymbolsMig1000000000094";

  private static readonly ENTRIES: Array<{
    slug: string;
    tickerKey: string | null;
    category: string;
    order: number;
  }> = [
    { slug: "XAU", tickerKey: null, category: "طلا", order: 10 },
    { slug: "USD", tickerKey: "usdToman", category: "ارز", order: 20 },
    { slug: "EUR", tickerKey: "eurToman", category: "ارز", order: 30 },
    { slug: "AED", tickerKey: null, category: "ارز", order: 40 },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const e of SeedTickerSymbolsMig1000000000094.ENTRIES) {
      // Matched on slug rather than id: slugs are the stable identifier and
      // this has to work against any environment's seed data.
      await queryRunner.query(
        `UPDATE "symbol"
            SET "is_ticker" = true,
                "ticker_key" = COALESCE("ticker_key", $1),
                "category" = COALESCE("category", $2),
                "display_order" = $3
          WHERE "slug" = $4 AND "deleted_at" IS NULL`,
        [e.tickerKey, e.category, e.order, e.slug],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const slugs = SeedTickerSymbolsMig1000000000094.ENTRIES.map((e) => e.slug);
    const keys = SeedTickerSymbolsMig1000000000094.ENTRIES.map((e) => e.tickerKey).filter(Boolean);
    // Clear only the keys this migration set, so a value an operator entered
    // later survives a rollback. `category` is left in place for the same
    // reason in reverse: `up` only fills it when it was null, and nothing here
    // can tell a value this migration wrote from one the desk chose, so
    // dropping it would risk destroying the desk's.
    await queryRunner.query(
      `UPDATE "symbol"
          SET "is_ticker" = false,
              "display_order" = 0,
              "ticker_key" = CASE WHEN "ticker_key" = ANY($1) THEN NULL ELSE "ticker_key" END
        WHERE "slug" = ANY($2)`,
      [keys, slugs],
    );
  }
}
