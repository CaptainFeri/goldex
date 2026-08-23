import { MigrationInterface, QueryRunner } from "typeorm";

export class CreditV2Mig1000000000081 implements MigrationInterface {
  name = "CreditV2Mig1000000000081";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Wallet type separation (DEPOSIT / CREDIT / COLLATERAL) ────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_type_enum') THEN
          CREATE TYPE "public"."wallet_type_enum" AS ENUM ('DEPOSIT', 'CREDIT', 'COLLATERAL');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'wallet' AND column_name = 'wallet_type'
        ) THEN
          ALTER TABLE "wallet" ADD COLUMN "wallet_type" "public"."wallet_type_enum" NOT NULL DEFAULT 'DEPOSIT';
        END IF;
      END $$;
    `);

    // Split legacy credit balances into dedicated CREDIT wallet rows.
    // Only reference columns that are guaranteed to exist (user_id, symbol_id,
    // credit_balance). All other columns use their defaults.
    await queryRunner.query(`
      INSERT INTO "wallet" (
        id, user_id, symbol_id, free_balance, locked_balance,
        available_balance, credit_balance,
        wallet_type, created_at, updated_at
      )
      SELECT
        gen_random_uuid(), w.user_id, w.symbol_id, w.credit_balance, 0,
        0, w.credit_balance,
        'CREDIT', now(), now()
      FROM "wallet" w
      WHERE w.credit_balance > 0 AND w.deleted_at IS NULL
    `);
    await queryRunner.query(`
      UPDATE "wallet"
      SET free_balance = available_balance, credit_balance = 0
      WHERE credit_balance > 0
    `);

    // Replace the unique (user_id, symbol_id) index: each symbol can now have
    // one wallet per type.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_WALLET_USER_PAIR"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_WALLET_USER_SYMBOL_TYPE"
      ON "wallet" (user_id, symbol_id, wallet_type)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_WALLET_USER_TYPE" ON "wallet" (user_id, wallet_type)
    `);

    // ── 2. Credit enforce mode enum + user-level credit config ──────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_enforce_mode_enum') THEN
          CREATE TYPE "public"."credit_enforce_mode_enum" AS ENUM ('ENFORCE', 'ALERT');
        END IF;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "user_level" ADD COLUMN "credit_base_symbol_id" uuid`);
    await queryRunner.query(`
      ALTER TABLE "user_level"
      ADD CONSTRAINT "FK_USER_LEVEL_CREDIT_BASE_SYMBOL"
      FOREIGN KEY ("credit_base_symbol_id") REFERENCES "symbol"("id")
      ON DELETE SET NULL
    `);
    await queryRunner.query(`ALTER TABLE "user_level" ADD COLUMN "credit_max_leverage" decimal(10,4)`);
    await queryRunner.query(`ALTER TABLE "user_level" ADD COLUMN "credit_drawdown_percent" decimal(5,2)`);
    await queryRunner.query(`
      ALTER TABLE "user_level" ADD COLUMN "credit_enforce_on_drawdown" "public"."credit_enforce_mode_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_level" ADD COLUMN "credit_enforce_on_expiry" "public"."credit_enforce_mode_enum"
    `);
    await queryRunner.query(`ALTER TABLE "user_level" ADD COLUMN "credit_enforce_request_deadline" boolean`);
    await queryRunner.query(`ALTER TABLE "user_level" ADD COLUMN "credit_max_parallel_requests" integer`);
    await queryRunner.query(`ALTER TABLE "user_level" ADD COLUMN "credit_max_execution_level" integer`);

    // ── 3. Price pair pend-deadline time limits (per side) ──────────
    // x = warn hours, y = expire hours, z = post-expire grace hours.
    await queryRunner.query(`ALTER TABLE "price_pairs" ADD COLUMN "buy_warn_hours" integer`);
    await queryRunner.query(`ALTER TABLE "price_pairs" ADD COLUMN "buy_expire_hours" integer`);
    await queryRunner.query(`ALTER TABLE "price_pairs" ADD COLUMN "buy_grace_hours" integer`);
    await queryRunner.query(`ALTER TABLE "price_pairs" ADD COLUMN "sell_warn_hours" integer`);
    await queryRunner.query(`ALTER TABLE "price_pairs" ADD COLUMN "sell_expire_hours" integer`);
    await queryRunner.query(`ALTER TABLE "price_pairs" ADD COLUMN "sell_grace_hours" integer`);
    
    // Excluded days from deadline calculation (0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday)
    await queryRunner.query(`ALTER TABLE "price_pairs" ADD COLUMN "excluded_days" integer[]`);

    // ── 4. Credit-linked request deadline tracking ──────────────────
    await queryRunner.query(`ALTER TABLE "order" ADD COLUMN "is_credit_linked" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "order" ADD COLUMN "pend_deadline_warn_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "order" ADD COLUMN "pend_deadline_expire_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "order" ADD COLUMN "pend_deadline_grace_end_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "order" ADD COLUMN "pend_deadline_state" varchar(20)`);
    await queryRunner.query(`
      CREATE INDEX "IDX_ORDER_CREDIT_DEADLINE" ON "order" (pend_deadline_grace_end_at)
    `);

    await queryRunner.query(`ALTER TABLE "quote_request" ADD COLUMN "is_credit_linked" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "quote_request" ADD COLUMN "pend_deadline_warn_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "quote_request" ADD COLUMN "pend_deadline_expire_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "quote_request" ADD COLUMN "pend_deadline_grace_end_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "quote_request" ADD COLUMN "pend_deadline_state" varchar(20)`);

    // ── 5. Credit facility fields ────────────────────────────────────
    // Self-service credits have no admin.
    await queryRunner.query(`ALTER TABLE "credit" ALTER COLUMN "admin_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "leverage" decimal(10,4)`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "credit_limit" decimal(20,8) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "used_credit" decimal(20,8) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "collateral_symbol_id" uuid`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "collateral_amount" decimal(20,8) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "initial_collateral_value" decimal(20,8) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "current_collateral_value" decimal(20,8) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "drawdown_percent" decimal(5,2)`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "last_drawdown_percent" decimal(5,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "credit_base_symbol_id" uuid`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "enforce_on_drawdown" "public"."credit_enforce_mode_enum"`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "enforce_on_expiry" "public"."credit_enforce_mode_enum"`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN "enforce_request_deadline" boolean`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 5
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "enforce_request_deadline"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "enforce_on_expiry"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "enforce_on_drawdown"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "credit_base_symbol_id"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "last_drawdown_percent"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "drawdown_percent"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "current_collateral_value"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "initial_collateral_value"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "collateral_amount"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "collateral_symbol_id"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "used_credit"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "credit_limit"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "leverage"`);
    await queryRunner.query(`ALTER TABLE "credit" ALTER COLUMN "admin_id" SET NOT NULL`);

    // 4
    await queryRunner.query(`ALTER TABLE "quote_request" DROP COLUMN "pend_deadline_state"`);
    await queryRunner.query(`ALTER TABLE "quote_request" DROP COLUMN "pend_deadline_grace_end_at"`);
    await queryRunner.query(`ALTER TABLE "quote_request" DROP COLUMN "pend_deadline_expire_at"`);
    await queryRunner.query(`ALTER TABLE "quote_request" DROP COLUMN "pend_deadline_warn_at"`);
    await queryRunner.query(`ALTER TABLE "quote_request" DROP COLUMN "is_credit_linked"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ORDER_CREDIT_DEADLINE"`);
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "pend_deadline_state"`);
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "pend_deadline_grace_end_at"`);
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "pend_deadline_expire_at"`);
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "pend_deadline_warn_at"`);
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "is_credit_linked"`);

    // 3
    await queryRunner.query(`ALTER TABLE "price_pairs" DROP COLUMN "excluded_days"`);
    await queryRunner.query(`ALTER TABLE "price_pairs" DROP COLUMN "sell_grace_hours"`);
    await queryRunner.query(`ALTER TABLE "price_pairs" DROP COLUMN "sell_expire_hours"`);
    await queryRunner.query(`ALTER TABLE "price_pairs" DROP COLUMN "sell_warn_hours"`);
    await queryRunner.query(`ALTER TABLE "price_pairs" DROP COLUMN "buy_grace_hours"`);
    await queryRunner.query(`ALTER TABLE "price_pairs" DROP COLUMN "buy_expire_hours"`);
    await queryRunner.query(`ALTER TABLE "price_pairs" DROP COLUMN "buy_warn_hours"`);

    // 2
    await queryRunner.query(`ALTER TABLE "user_level" DROP COLUMN "credit_max_execution_level"`);
    await queryRunner.query(`ALTER TABLE "user_level" DROP COLUMN "credit_max_parallel_requests"`);
    await queryRunner.query(`ALTER TABLE "user_level" DROP COLUMN "credit_enforce_request_deadline"`);
    await queryRunner.query(`ALTER TABLE "user_level" DROP COLUMN "credit_enforce_on_expiry"`);
    await queryRunner.query(`ALTER TABLE "user_level" DROP COLUMN "credit_enforce_on_drawdown"`);
    await queryRunner.query(`ALTER TABLE "user_level" DROP COLUMN "credit_drawdown_percent"`);
    await queryRunner.query(`ALTER TABLE "user_level" DROP COLUMN "credit_max_leverage"`);
    await queryRunner.query(`ALTER TABLE "user_level" DROP CONSTRAINT "FK_USER_LEVEL_CREDIT_BASE_SYMBOL"`);
    await queryRunner.query(`ALTER TABLE "user_level" DROP COLUMN "credit_base_symbol_id"`);

    // 1
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_WALLET_USER_TYPE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_WALLET_USER_SYMBOL_TYPE"`);
    await queryRunner.query(`
      DELETE FROM "wallet" WHERE wallet_type IN ('CREDIT', 'COLLATERAL')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_WALLET_USER_PAIR" ON "wallet" (user_id, symbol_id)
    `);
    await queryRunner.query(`ALTER TABLE "wallet" DROP COLUMN "wallet_type"`);
    await queryRunner.query(`DROP TYPE "public"."credit_enforce_mode_enum"`);
    await queryRunner.query(`DROP TYPE "public"."wallet_type_enum"`);
  }
}
