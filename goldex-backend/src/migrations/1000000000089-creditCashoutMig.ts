import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Credit cash-out: converting a purchase made with credit into a fully-paid
 * holding without closing the facility.
 *
 *  - credit_order gains the CASHED_OUT state (the trade leaves the facility)
 *  - finance_log gains the CREDIT_CASHED_OUT action
 *  - system_ledger gains the two cash-out profit types
 *  - credit gains the admin-managed cash-out fee
 *  - new credit_cashout audit table (amounts, source, profit, capacity impact)
 */
export class CreditCashoutMig1000000000089 implements MigrationInterface {
  name = "CreditCashoutMig1000000000089";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 0. Extend the enums the new flow writes into ──────────────────────
    const enumValues: Array<{ table: string; column: string; values: string[] }> = [
      { table: "credit_order", column: "status", values: ["CASHED_OUT"] },
      { table: "finance_log", column: "action_type", values: ["CREDIT_CASHED_OUT"] },
      {
        table: "system_ledger",
        column: "type",
        values: ["CREDIT_CASHOUT_FEE", "CREDIT_CASHOUT_SPREAD"],
      },
    ];
    for (const { table, column, values } of enumValues) {
      for (const value of values) {
        await queryRunner.query(`
          DO $$
          DECLARE enum_type text;
          BEGIN
            SELECT udt_name INTO enum_type FROM information_schema.columns
              WHERE table_name = '${table}' AND column_name = '${column}';
            IF enum_type IS NOT NULL THEN
              EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L', enum_type, '${value}');
            END IF;
          END $$;
        `);
      }
    }

    // ── 1. Admin-managed cash-out fee on the facility ─────────────────────
    await queryRunner.query(`
      ALTER TABLE "credit"
        ADD COLUMN IF NOT EXISTS "cashout_fee_percent" numeric(5,2) NOT NULL DEFAULT 0
    `);

    // ── 2. Cash-out audit table ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_cashout" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "credit_id" uuid NOT NULL,
        "credit_order_id" uuid NOT NULL,
        "order_id" uuid,
        "source" varchar(20) NOT NULL,
        "amount" numeric(20,8) NOT NULL DEFAULT 0,
        "fee_percent" numeric(5,2) NOT NULL DEFAULT 0,
        "fee_amount" numeric(20,8) NOT NULL DEFAULT 0,
        "spread_profit" numeric(20,8) NOT NULL DEFAULT 0,
        "system_profit_value" numeric(20,8) NOT NULL DEFAULT 0,
        "asset_symbol_id" uuid,
        "asset_amount" numeric(20,8) NOT NULL DEFAULT 0,
        "collateral_consumed" numeric(20,8) NOT NULL DEFAULT 0,
        "mark_price" numeric(20,8) NOT NULL DEFAULT 0,
        "credit_limit_reduction" numeric(20,8) NOT NULL DEFAULT 0,
        "sell_capacity_reduction" numeric(20,8) NOT NULL DEFAULT 0,
        "requested_by" varchar(50),
        "admin_id" varchar(50),
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_CREDIT_CASHOUT" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_CREDIT_CASHOUT_CREDIT') THEN
          ALTER TABLE "credit_cashout"
            ADD CONSTRAINT "FK_CREDIT_CASHOUT_CREDIT"
            FOREIGN KEY ("credit_id") REFERENCES "credit"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_CREDIT_CASHOUT_TRADE') THEN
          ALTER TABLE "credit_cashout"
            ADD CONSTRAINT "FK_CREDIT_CASHOUT_TRADE"
            FOREIGN KEY ("credit_order_id") REFERENCES "credit_order"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CREDIT_CASHOUT_CREDIT" ON "credit_cashout" ("credit_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CREDIT_CASHOUT_TRADE" ON "credit_cashout" ("credit_order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_cashout"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN IF EXISTS "cashout_fee_percent"`);
    // Postgres cannot drop a value from an enum type — CASHED_OUT,
    // CREDIT_CASHED_OUT and the cash-out ledger types stay in place.
  }
}
