import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Which way round a bot runs its cycle, and how many provider orders that took.
 *
 * A bot funded with cash can only buy first; one funded with the asset can only
 * sell first. Existing bots were all cash-funded in practice, so BUY_FIRST is
 * the backfill. `total_transactions` starts from twice the cycles already
 * recorded, since every cycle placed a buy and a sell.
 */
export class ArbitrageBotDirectionMig1000000000105 implements MigrationInterface {
  name = "ArbitrageBotDirectionMig1000000000105";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "arbitrage_bot"
        ADD COLUMN IF NOT EXISTS "total_transactions" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "arbitrage_bot" SET "total_transactions" = "total_trades" * 2
       WHERE "total_transactions" = 0 AND "total_trades" > 0
    `);
    await queryRunner.query(`
      ALTER TABLE "arbitrage_bot_trade"
        ADD COLUMN IF NOT EXISTS "direction" character varying(12) NOT NULL DEFAULT 'BUY_FIRST'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "arbitrage_bot_trade" DROP COLUMN IF EXISTS "direction"`);
    await queryRunner.query(`ALTER TABLE "arbitrage_bot" DROP COLUMN IF EXISTS "total_transactions"`);
  }
}
