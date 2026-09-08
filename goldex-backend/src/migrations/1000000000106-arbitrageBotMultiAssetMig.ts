import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Moves a bot's funding out of the bot row and into one row per asset.
 *
 * A bot used to hold a single allocation, which forced a choice it should
 * never have had to make: cash funds a buy-first cycle and the metal funds a
 * sell-first one, so a single-asset bot could only ever act on half the
 * opportunities it matched. Funding a bot with 10g of gold *and* 100bn Rial
 * requires a row per asset, each with its own stop-loss — a gold loss must not
 * be excused by a Rial budget it has nothing to do with.
 *
 * The old columns are copied into the new table and then dropped, so there is
 * exactly one place a bot's frozen capital lives. `stop_loss_percent` stays on
 * the bot as the default applied to new allocations.
 */
export class ArbitrageBotMultiAssetMig1000000000106 implements MigrationInterface {
  name = "ArbitrageBotMultiAssetMig1000000000106";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "arbitrage_bot_allocation" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "bot_id" uuid NOT NULL,
        "symbol_id" uuid NOT NULL,
        "manager_account_id" uuid NOT NULL,
        "allocated_amount" numeric(20,8) NOT NULL DEFAULT 0,
        "stop_loss_percent" numeric(5,2) NOT NULL DEFAULT 100,
        "stop_loss_amount" numeric(20,8) NOT NULL DEFAULT 0,
        "realized_pnl" numeric(20,8) NOT NULL DEFAULT 0,
        "realized_loss" numeric(20,8) NOT NULL DEFAULT 0,
        CONSTRAINT "pk_arbitrage_bot_allocation" PRIMARY KEY ("id"),
        CONSTRAINT "fk_bot_allocation_bot" FOREIGN KEY ("bot_id")
          REFERENCES "arbitrage_bot"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_bot_allocation_symbol" FOREIGN KEY ("symbol_id")
          REFERENCES "symbol"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_bot_allocation_account" FOREIGN KEY ("manager_account_id")
          REFERENCES "manager_account"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_bot_allocation_asset"
        ON "arbitrage_bot_allocation" ("bot_id", "symbol_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bot_allocation_bot"
        ON "arbitrage_bot_allocation" ("bot_id")
    `);

    // Every funded bot becomes one allocation row carrying exactly what it had.
    await queryRunner.query(`
      INSERT INTO "arbitrage_bot_allocation"
        ("bot_id", "symbol_id", "manager_account_id", "allocated_amount",
         "stop_loss_percent", "stop_loss_amount", "realized_pnl", "realized_loss")
      SELECT "id", "symbol_id", "manager_account_id", "allocated_amount",
             "stop_loss_percent", "stop_loss_amount", "realized_pnl", "realized_loss"
        FROM "arbitrage_bot"
       WHERE "symbol_id" IS NOT NULL AND "manager_account_id" IS NOT NULL
      ON CONFLICT DO NOTHING
    `);

    // A settled trade has to say which asset paid for it, or its result cannot
    // be booked back to the right budget.
    await queryRunner.query(`
      ALTER TABLE "arbitrage_bot_trade"
        ADD COLUMN IF NOT EXISTS "allocation_id" uuid
    `);
    await queryRunner.query(`
      UPDATE "arbitrage_bot_trade" AS t
         SET "allocation_id" = a."id"
        FROM "arbitrage_bot_allocation" AS a
       WHERE a."bot_id" = t."bot_id" AND t."allocation_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "arbitrage_bot_trade"
        ADD CONSTRAINT "fk_bot_trade_allocation" FOREIGN KEY ("allocation_id")
          REFERENCES "arbitrage_bot_allocation"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "arbitrage_bot"
        DROP COLUMN IF EXISTS "manager_account_id",
        DROP COLUMN IF EXISTS "symbol_id",
        DROP COLUMN IF EXISTS "allocated_amount",
        DROP COLUMN IF EXISTS "stop_loss_amount",
        DROP COLUMN IF EXISTS "realized_pnl",
        DROP COLUMN IF EXISTS "realized_loss"
    `);
  }

  /**
   * Best effort: a bot with several allocations cannot be represented by the
   * single-asset columns, so the largest one is restored and the rest are
   * reported by the allocation table that stays behind until it is dropped.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "arbitrage_bot"
        ADD COLUMN IF NOT EXISTS "manager_account_id" uuid,
        ADD COLUMN IF NOT EXISTS "symbol_id" uuid,
        ADD COLUMN IF NOT EXISTS "allocated_amount" numeric(20,8) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "stop_loss_amount" numeric(20,8) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "realized_pnl" numeric(20,8) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "realized_loss" numeric(20,8) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "arbitrage_bot" AS b
         SET "manager_account_id" = a."manager_account_id",
             "symbol_id" = a."symbol_id",
             "allocated_amount" = a."allocated_amount",
             "stop_loss_amount" = a."stop_loss_amount",
             "realized_pnl" = a."realized_pnl",
             "realized_loss" = a."realized_loss"
        FROM (
          SELECT DISTINCT ON ("bot_id") *
            FROM "arbitrage_bot_allocation"
           ORDER BY "bot_id", "allocated_amount" DESC
        ) AS a
       WHERE a."bot_id" = b."id"
    `);
    await queryRunner.query(`
      ALTER TABLE "arbitrage_bot_trade" DROP CONSTRAINT IF EXISTS "fk_bot_trade_allocation"
    `);
    await queryRunner.query(`
      ALTER TABLE "arbitrage_bot_trade" DROP COLUMN IF EXISTS "allocation_id"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "arbitrage_bot_allocation"`);
  }
}
