import { MigrationInterface, QueryRunner } from "typeorm";

export class UserLevelPairsMig1000000000079 implements MigrationInterface {
  name = "UserLevelPairsMig1000000000079";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create join table user_level_pairs
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_level_pairs" (
        "level_id" uuid NOT NULL,
        "pair_id" uuid NOT NULL,
        CONSTRAINT "PK_user_level_pairs" PRIMARY KEY ("level_id", "pair_id"),
        CONSTRAINT "FK_ulp_level" FOREIGN KEY ("level_id") REFERENCES "user_level"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ulp_pair" FOREIGN KEY ("pair_id") REFERENCES "price_pairs"("id") ON DELETE CASCADE
      )
    `);

    // 2. Ensure USD/IRR pair exists (base USD, quote IRR)
    const usd = await queryRunner.query(`SELECT id FROM "symbol" WHERE "slug" = 'USD' AND "deleted_at" IS NULL LIMIT 1`);
    const irr = await queryRunner.query(`SELECT id FROM "symbol" WHERE "slug" = 'IRR' AND "deleted_at" IS NULL LIMIT 1`);
    if (usd.length > 0 && irr.length > 0) {
      const existing = await queryRunner.query(
        `SELECT id FROM "price_pairs" WHERE "base_id" = $1 AND "quote_id" = $2 AND "deleted_at" IS NULL LIMIT 1`,
        [usd[0].id, irr[0].id]
      );
      if (existing.length === 0) {
        await queryRunner.query(
          `INSERT INTO "price_pairs"
           ("base_id", "quote_id", "price", "last_updated", "is_valid", "buy_commission", "sell_commission",
            "trading_view_symbol", "min_buy", "max_buy", "min_sell", "max_sell", "decimals",
            "best_buy_price", "best_sell_price", "created_at", "updated_at")
           VALUES ($1, $2, 84000, NOW(), true, 0.005, 0.005, 'USDIRR', 1, 100000, 1, 100000, 2, 84000, 84000, NOW(), NOW())`,
          [usd[0].id, irr[0].id]
        );
      }
    }

    // 3. Helper to resolve a pair id by base/quote slug
    const pairIdBySlugs = async (base: string, quote: string) => {
      const rows = await queryRunner.query(
        `SELECT pp.id FROM "price_pairs" pp
         JOIN "symbol" bs ON bs.id = pp.base_id
         JOIN "symbol" qs ON qs.id = pp.quote_id
         WHERE bs.slug = $1 AND qs.slug = $2 AND pp."deleted_at" IS NULL AND pp."is_valid" = true
         LIMIT 1`,
        [base, quote]
      );
      return rows.length ? rows[0].id : null;
    };

    // 4. Replace old seeded levels: reassign users to the new default, then delete old rows.
    await queryRunner.query(`
      DO $$
      DECLARE dflt uuid;
      BEGIN
        SELECT id INTO dflt FROM "user_level" WHERE "slug" = 'gold-retail' AND "deleted_at" IS NULL LIMIT 1;
        IF dflt IS NOT NULL THEN
          UPDATE "user" SET "level_id" = dflt WHERE "level_id" IN (
            SELECT id FROM "user_level" WHERE "slug" IN ('bronze','silver','gold','platinum')
          );
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `DELETE FROM "user_level" WHERE "slug" IN ('bronze','silver','gold','platinum')`
    );
    await queryRunner.query(
      `DELETE FROM "user_level_pairs" WHERE "level_id" NOT IN (SELECT id FROM "user_level")`
    );

    // 5. Feature sets for the four Iran market roles
    const baseCommon = {
      TRADING_DAILY_LIMIT: { amount: 2000000000, currency: "IRR" },
      TRADING_MAX_ORDER_VALUE: { amount: 500000000, currency: "IRR" },
      TRADING_MAX_OPEN_ORDERS: 25,
      WALLET_WITHDRAWAL_DAILY_LIMIT: { amount: 500000000, currency: "IRR" },
      WALLET_WITHDRAWAL_PER_TX_LIMIT: { amount: 100000000, currency: "IRR" },
      CREDIT_MAX_AMOUNT: { amount: 1000000000, currency: "IRR" },
      CREDIT_MAX_DURATION_DAYS: 60,
      TELEGRAM_BOT_ENABLED: { enabled: true },
      API_ACCESS_ENABLED: { enabled: true },
      ELITE_TRADE_ENABLED: { enabled: false },
      PRIORITY_SUPPORT: { enabled: false },
      MAX_MARKET_TYPES: 1,
      KYC_REQUIRED: { enabled: true },
      KYC_AUTOMATIC_ENABLED: { enabled: true },
      KYC_DOCUMENT_REQUIRED: { enabled: false },
      WITHDRAW_MIN_HOURS_AFTER_REGISTER: 72,
      WALLET_DAILY_DEPOSIT_LIMIT: { amount: 2000000000, currency: "IRR" },
      WALLET_DAILY_TRANSFER_LIMIT: { amount: 500000000, currency: "IRR" },
      ELITE_MIN_BALANCE: { amount: 0, currency: "IRR" },
      ELITE_MIN_TRADING_VOLUME: { amount: 0, currency: "IRR" },
      ELITE_MIN_REFERRALS: 0,
      MARKET_ORDER_ENABLED: { enabled: true },
      LIMIT_ORDER_ENABLED: { enabled: true },
      QUOTE_REQUEST_ENABLED: { enabled: false },
    };

    const levels: { slug: string; name: string; desc: string; priority: number; isDefault: boolean; features: any; pairs: [string, string][] }[] = [
      {
        slug: "gold-retail",
        name: "خرده فروشی طلا ایران",
        desc: "خرده فروشی طلا برای کاربران ایرانی - معامله طلا با ریال",
        priority: 1,
        isDefault: true,
        features: baseCommon,
        pairs: [["XAU", "IRR"]],
      },
      {
        slug: "dollar-seller",
        name: "دلار فروشان ایران",
        desc: "فروشندگان ارز دلار در ایران - معامله دلار با ریال",
        priority: 2,
        isDefault: false,
        features: {
          ...baseCommon,
          TRADING_DAILY_LIMIT: { amount: 5000000000, currency: "IRR" },
          TRADING_MAX_ORDER_VALUE: { amount: 1000000000, currency: "IRR" },
          TRADING_MAX_OPEN_ORDERS: 50,
          WALLET_WITHDRAWAL_DAILY_LIMIT: { amount: 1000000000, currency: "IRR" },
          WALLET_WITHDRAWAL_PER_TX_LIMIT: { amount: 300000000, currency: "IRR" },
        },
        pairs: [["USD", "IRR"]],
      },
      {
        slug: "gold-wholesale",
        name: "عمده فروش طلا ایران",
        desc: "عمده فروشی طلا برای کاربران ایرانی - حجم بالا",
        priority: 3,
        isDefault: false,
        features: {
          ...baseCommon,
          TRADING_DAILY_LIMIT: { amount: 20000000000, currency: "IRR" },
          TRADING_MAX_ORDER_VALUE: { amount: 5000000000, currency: "IRR" },
          TRADING_MAX_OPEN_ORDERS: 100,
          WALLET_WITHDRAWAL_DAILY_LIMIT: { amount: 5000000000, currency: "IRR" },
          WALLET_WITHDRAWAL_PER_TX_LIMIT: { amount: 1000000000, currency: "IRR" },
          CREDIT_MAX_AMOUNT: { amount: 10000000000, currency: "IRR" },
          CREDIT_MAX_DURATION_DAYS: 90,
          WALLET_DAILY_DEPOSIT_LIMIT: { amount: 20000000000, currency: "IRR" },
          WALLET_DAILY_TRANSFER_LIMIT: { amount: 5000000000, currency: "IRR" },
          ELITE_TRADE_ENABLED: { enabled: true },
          ELITE_MIN_BALANCE: { amount: 10000000000, currency: "IRR" },
          ELITE_MIN_TRADING_VOLUME: { amount: 50000000000, currency: "IRR" },
          ELITE_MIN_REFERRALS: 5,
          QUOTE_REQUEST_ENABLED: { enabled: true },
        },
        pairs: [["XAU", "IRR"]],
      },
      {
        slug: "mediator",
        name: "میانجی",
        desc: "میانجی بازار - دسترسی به همه جفت‌های معتبر",
        priority: 4,
        isDefault: false,
        features: {
          ...baseCommon,
          TRADING_DAILY_LIMIT: { amount: 0, currency: "IRR" },
          TRADING_MAX_ORDER_VALUE: { amount: 0, currency: "IRR" },
          TRADING_MAX_OPEN_ORDERS: 999,
          WALLET_WITHDRAWAL_DAILY_LIMIT: { amount: 0, currency: "IRR" },
          WALLET_WITHDRAWAL_PER_TX_LIMIT: { amount: 0, currency: "IRR" },
          CREDIT_MAX_AMOUNT: { amount: 0, currency: "IRR" },
          CREDIT_MAX_DURATION_DAYS: 365,
          WALLET_DAILY_DEPOSIT_LIMIT: { amount: 0, currency: "IRR" },
          WALLET_DAILY_TRANSFER_LIMIT: { amount: 0, currency: "IRR" },
          ELITE_TRADE_ENABLED: { enabled: true },
          PRIORITY_SUPPORT: { enabled: true },
          MAX_MARKET_TYPES: 999,
          WITHDRAW_MIN_HOURS_AFTER_REGISTER: 0,
          MARKET_ORDER_ENABLED: { enabled: true },
          LIMIT_ORDER_ENABLED: { enabled: true },
          QUOTE_REQUEST_ENABLED: { enabled: true },
        },
        pairs: [], // filled with all valid pairs below
      },
    ];

    for (const lvl of levels) {
      const featuresJson = JSON.stringify(lvl.features);
      const result = await queryRunner.query(
        `INSERT INTO "user_level" ("name", "slug", "description", "priority", "is_default", "features", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
         RETURNING "id"`,
        [lvl.name, lvl.slug, lvl.desc, lvl.priority, lvl.isDefault, featuresJson]
      );
      const levelId = result[0].id;

      let pairIds: string[] = [];
      if (lvl.slug === "mediator") {
        const allPairs = await queryRunner.query(
          `SELECT id FROM "price_pairs" WHERE "deleted_at" IS NULL AND "is_valid" = true`
        );
        pairIds = allPairs.map((p: any) => p.id);
      } else {
        for (const [base, quote] of lvl.pairs) {
          const pid = await pairIdBySlugs(base, quote);
          if (pid) pairIds.push(pid);
        }
      }

      for (const pid of pairIds) {
        await queryRunner.query(
          `INSERT INTO "user_level_pairs" ("level_id", "pair_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [levelId, pid]
        );
      }
    }

    // 6. Reassign users currently on a deleted/old level to the new default.
    await queryRunner.query(`
      UPDATE "user" SET "level_id" = (
        SELECT id FROM "user_level" WHERE "is_default" = true AND "deleted_at" IS NULL LIMIT 1
      )
      WHERE "level_id" IS NULL OR "level_id" NOT IN (SELECT id FROM "user_level")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "user_level" WHERE "slug" IN ('gold-retail','dollar-seller','gold-wholesale','mediator')`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_level_pairs"`);
  }
}