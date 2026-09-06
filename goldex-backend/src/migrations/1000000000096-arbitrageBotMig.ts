import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Admin-defined arbitrage bots, their trades and their event log.
 *
 * A bot carries three configurations as JSON — what it watches (`scope`), when
 * it acts (`thresholds`) and who it tells (`notifications`) — because those
 * shapes are expected to keep growing, and a new knob should not need a
 * migration. The money columns are not JSON: `allocated_amount` and
 * `stop_loss_amount` are the frozen capital and the loss budget measured
 * against it, and they are queried and constrained like the balances they are.
 */
export class ArbitrageBotMig1000000000096 implements MigrationInterface {
  name = "ArbitrageBotMig1000000000096";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "arbitrage_bot" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "name" character varying(120) NOT NULL,
        "description" text,
        "owner_admin_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'DRAFT',
        "execution_mode" character varying(20) NOT NULL DEFAULT 'SIGNAL_ONLY',
        "scope" jsonb NOT NULL DEFAULT '{"pricePairIds":[],"marketTypes":[],"providerKeys":[],"itemIds":[]}'::jsonb,
        "thresholds" jsonb NOT NULL DEFAULT '{"minProfitRial":0,"minProfitPercent":0,"maxTradeVolume":0,"maxOpenTrades":1,"maxTradesPerHour":10,"cooldownSeconds":30,"maxQuoteAgeSeconds":30}'::jsonb,
        "notifications" jsonb NOT NULL DEFAULT '{"enabled":true,"channels":["ADMIN_PANEL"],"events":["TRADE_SUBMITTED","TRADE_FILLED","TRADE_FAILED","LOSS_WARNING","STOP_LOSS_HIT","ERROR"],"lossWarningPercent":70,"minProfitToNotifyRial":0,"throttleSeconds":60,"telegramChatId":null,"smsPhone":null}'::jsonb,
        "manager_account_id" uuid,
        "symbol_id" uuid,
        "allocated_amount" numeric(20,8) NOT NULL DEFAULT 0,
        "stop_loss_percent" numeric(5,2) NOT NULL DEFAULT 100,
        "stop_loss_amount" numeric(20,8) NOT NULL DEFAULT 0,
        "realized_pnl" numeric(20,8) NOT NULL DEFAULT 0,
        "realized_loss" numeric(20,8) NOT NULL DEFAULT 0,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "stopped_at" TIMESTAMP WITH TIME ZONE,
        "halted_at" TIMESTAMP WITH TIME ZONE,
        "halt_reason" text,
        "last_signal_at" TIMESTAMP WITH TIME ZONE,
        "last_trade_at" TIMESTAMP WITH TIME ZONE,
        "matched_signals" integer NOT NULL DEFAULT 0,
        "total_trades" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_arbitrage_bot" PRIMARY KEY ("id"),
        CONSTRAINT "FK_arbitrage_bot_owner" FOREIGN KEY ("owner_admin_id")
          REFERENCES "admin"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_arbitrage_bot_account" FOREIGN KEY ("manager_account_id")
          REFERENCES "manager_account"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_arbitrage_bot_symbol" FOREIGN KEY ("symbol_id")
          REFERENCES "symbol"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arbitrage_bot_owner_status"
        ON "arbitrage_bot" ("owner_admin_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arbitrage_bot_status" ON "arbitrage_bot" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "arbitrage_bot_trade" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "bot_id" uuid NOT NULL,
        "signal_key" character varying(200) NOT NULL,
        "signal_id" character varying(100),
        "item_id" integer,
        "item_name" character varying(200),
        "buy_provider_key" character varying(100) NOT NULL,
        "sell_provider_key" character varying(100) NOT NULL,
        "buy_price" numeric(20,8) NOT NULL,
        "sell_price" numeric(20,8) NOT NULL,
        "volume" numeric(20,8) NOT NULL,
        "expected_profit_rial" numeric(20,8) NOT NULL,
        "realized_profit_rial" numeric(20,8),
        "realized_pnl_asset" numeric(20,8),
        "status" character varying(20) NOT NULL DEFAULT 'PLANNED',
        "legs" jsonb,
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "settled_at" TIMESTAMP WITH TIME ZONE,
        "failure_reason" text,
        "signal" jsonb,
        CONSTRAINT "PK_arbitrage_bot_trade" PRIMARY KEY ("id"),
        CONSTRAINT "FK_arbitrage_bot_trade_bot" FOREIGN KEY ("bot_id")
          REFERENCES "arbitrage_bot"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arbitrage_bot_trade_bot_status"
        ON "arbitrage_bot_trade" ("bot_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arbitrage_bot_trade_bot_created"
        ON "arbitrage_bot_trade" ("bot_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arbitrage_bot_trade_signal_key"
        ON "arbitrage_bot_trade" ("signal_key")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "arbitrage_bot_event" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "bot_id" uuid NOT NULL,
        "type" character varying(30) NOT NULL,
        "severity" character varying(10) NOT NULL DEFAULT 'INFO',
        "title" character varying(200) NOT NULL,
        "message" text NOT NULL,
        "metadata" jsonb,
        "notified_channels" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "trade_id" uuid,
        CONSTRAINT "PK_arbitrage_bot_event" PRIMARY KEY ("id"),
        CONSTRAINT "FK_arbitrage_bot_event_bot" FOREIGN KEY ("bot_id")
          REFERENCES "arbitrage_bot"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_arbitrage_bot_event_bot_created"
        ON "arbitrage_bot_event" ("bot_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "arbitrage_bot_event"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "arbitrage_bot_trade"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "arbitrage_bot"`);
  }
}
