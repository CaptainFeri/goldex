import { MigrationInterface, QueryRunner } from "typeorm";

export class CreditRefactorMig1000000000080 implements MigrationInterface {
  name = "CreditRefactorMig1000000000080";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Item 1: Wallet balance separation ──────────────────────────
    await queryRunner.query(`
      ALTER TABLE "wallet" ADD COLUMN "available_balance" decimal(20,8) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet" ADD COLUMN "credit_balance" decimal(20,8) NOT NULL DEFAULT 0
    `);
    // Backfill: existing freeBalance becomes user's own available
    await queryRunner.query(`
      UPDATE "wallet" SET "available_balance" = "free_balance"
    `);

    // ── Item 2: Trade chain depth ─────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "max_concurrent_orders" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "max_trade_chain_depth" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "current_trade_chain_depth" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_order" ADD COLUMN "trade_chain_level" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_order" ADD COLUMN "trade_thread_id" varchar(50)
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_order" ADD COLUMN "parent_credit_order_id" uuid
    `);

    // ── Item 3: Settlement timer state machine ─────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_state_enum') THEN
          CREATE TYPE "public"."settlement_state_enum" AS ENUM(
            'GREEN', 'YELLOW', 'RED', 'ADMIN_REVIEW', 'AUTO_LIQUIDATION', 'SETTLED'
          );
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_state_enum') THEN
          CREATE TYPE "public"."risk_state_enum" AS ENUM(
            'NORMAL', 'WARNING', 'MARGIN_CALL', 'REDUCING', 'LIQUIDATING', 'LIQUIDATED', 'SETTLED', 'DEFAULT'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "settlement_state" "public"."settlement_state_enum" NOT NULL DEFAULT 'GREEN'
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "risk_state" "public"."risk_state_enum" NOT NULL DEFAULT 'NORMAL'
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "green_duration_hours" integer NOT NULL DEFAULT 8
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "yellow_duration_hours" integer NOT NULL DEFAULT 4
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "red_duration_hours" integer NOT NULL DEFAULT 4
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "settlement_yellow_at" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "settlement_red_at" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "settlement_admin_review_at" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "risk_warning_at" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "risk_margin_call_at" timestamptz
    `);

    // ── Item 4: Bad-debt policy (full recourse) ───────────────────
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "outstanding_shortfall" decimal(20,8) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "credit" ADD COLUMN "is_in_default" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Item 4
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "is_in_default"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "outstanding_shortfall"`);

    // Item 3
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "risk_margin_call_at"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "risk_warning_at"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "settlement_admin_review_at"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "settlement_red_at"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "settlement_yellow_at"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "red_duration_hours"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "yellow_duration_hours"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "green_duration_hours"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "risk_state"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "settlement_state"`);
    await queryRunner.query(`DROP TYPE "public"."risk_state_enum"`);
    await queryRunner.query(`DROP TYPE "public"."settlement_state_enum"`);

    // Item 2
    await queryRunner.query(`ALTER TABLE "credit_order" DROP COLUMN "parent_credit_order_id"`);
    await queryRunner.query(`ALTER TABLE "credit_order" DROP COLUMN "trade_thread_id"`);
    await queryRunner.query(`ALTER TABLE "credit_order" DROP COLUMN "trade_chain_level"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "current_trade_chain_depth"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "max_trade_chain_depth"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "max_concurrent_orders"`);

    // Item 1
    await queryRunner.query(`ALTER TABLE "wallet" DROP COLUMN "credit_balance"`);
    await queryRunner.query(`ALTER TABLE "wallet" DROP COLUMN "available_balance"`);
  }
}
