import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Credit v3 (handoff credit_trading_handoff_fa.docx):
 *  - per-trade Collateral Lock table + state machine
 *  - delivery-based Settlement workflow table + state machine
 *  - max_credit_notional / max_total_locked_collateral on credit
 *  - level-level max notional / locked-collateral ratio
 *  - CreditOrderStatusEnum.CLOSED
 */
export class CreditV3Mig1000000000086 implements MigrationInterface {
  name = "CreditV3Mig1000000000086";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Enums ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collateral_lock_status_enum') THEN
          CREATE TYPE "public"."collateral_lock_status_enum" AS ENUM
            ('CREATED', 'ACTIVE', 'RELEASE_PENDING', 'RELEASED', 'CONSUMED');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_workflow_status_enum') THEN
          CREATE TYPE "public"."settlement_workflow_status_enum" AS ENUM
            ('SETTLEMENT_REQUESTED', 'ASSET_RECEIVED', 'ASSET_VERIFIED', 'LIABILITY_CLEARED',
             'ASSET_SETTLED', 'COLLATERAL_RELEASED', 'CLOSED', 'FAILED');
        END IF;
      END $$;
    `);

    // Extend the existing credit_order status enum with CLOSED.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_order_status_enum') THEN
          ALTER TYPE "public"."credit_order_status_enum" ADD VALUE IF NOT EXISTS 'CLOSED';
        END IF;
      END $$;
    `);

    // ── 2. collateral_lock table ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "collateral_lock" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "credit_id" uuid NOT NULL,
        "credit_order_id" uuid,
        "amount" numeric(20,8) NOT NULL DEFAULT 0,
        "notional_value" numeric(20,8) NOT NULL DEFAULT 0,
        "price_at_lock" numeric(20,8),
        "status" "public"."collateral_lock_status_enum" NOT NULL DEFAULT 'CREATED',
        "activated_at" timestamptz,
        "released_at" timestamptz,
        "consumed_at" timestamptz,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_COLLATERAL_LOCK" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "collateral_lock"
        ADD CONSTRAINT "FK_COLLATERAL_LOCK_CREDIT"
        FOREIGN KEY ("credit_id") REFERENCES "credit"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "collateral_lock"
        ADD CONSTRAINT "FK_COLLATERAL_LOCK_TRADE"
        FOREIGN KEY ("credit_order_id") REFERENCES "credit_order"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_COLLATERAL_LOCK_CREDIT" ON "collateral_lock" ("credit_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_COLLATERAL_LOCK_TRADE" ON "collateral_lock" ("credit_order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_COLLATERAL_LOCK_STATUS" ON "collateral_lock" ("status")`);

    // ── 3. credit_settlement table (delivery-based workflow) ──────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_settlement" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "credit_id" uuid NOT NULL,
        "credit_order_id" uuid,
        "required_asset_symbol_id" uuid,
        "required_amount" numeric(20,8) NOT NULL DEFAULT 0,
        "received_amount" numeric(20,8) NOT NULL DEFAULT 0,
        "status" "public"."settlement_workflow_status_enum" NOT NULL DEFAULT 'SETTLEMENT_REQUESTED',
        "requested_by" varchar(50),
        "requested_at" timestamptz,
        "received_at" timestamptz,
        "verified_at" timestamptz,
        "liability_cleared_at" timestamptz,
        "asset_settled_at" timestamptz,
        "collateral_released_at" timestamptz,
        "closed_at" timestamptz,
        "notes" text,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_CREDIT_SETTLEMENT" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_settlement"
        ADD CONSTRAINT "FK_CREDIT_SETTLEMENT_CREDIT"
        FOREIGN KEY ("credit_id") REFERENCES "credit"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_settlement"
        ADD CONSTRAINT "FK_CREDIT_SETTLEMENT_TRADE"
        FOREIGN KEY ("credit_order_id") REFERENCES "credit_order"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CREDIT_SETTLEMENT_CREDIT" ON "credit_settlement" ("credit_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_CREDIT_SETTLEMENT_TRADE" ON "credit_settlement" ("credit_order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_CREDIT_SETTLEMENT_STATUS" ON "credit_settlement" ("status")`);

    // ── 4. credit risk-limit columns ──────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'credit' AND column_name = 'max_credit_notional') THEN
          ALTER TABLE "credit" ADD COLUMN "max_credit_notional" numeric(20,8);
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'credit' AND column_name = 'max_total_locked_collateral') THEN
          ALTER TABLE "credit" ADD COLUMN "max_total_locked_collateral" numeric(5,4);
        END IF;
      END $$;
    `);

    // ── 5. user_level risk-limit columns ──────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_level' AND column_name = 'credit_max_notional') THEN
          ALTER TABLE "user_level" ADD COLUMN "credit_max_notional" numeric(20,8);
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_level' AND column_name = 'credit_max_locked_collateral') THEN
          ALTER TABLE "user_level" ADD COLUMN "credit_max_locked_collateral" numeric(5,4);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 5
    await queryRunner.query(`ALTER TABLE "user_level" DROP COLUMN "credit_max_locked_collateral"`);
    await queryRunner.query(`ALTER TABLE "user_level" DROP COLUMN "credit_max_notional"`);
    // 4
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "max_total_locked_collateral"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "max_credit_notional"`);
    // 3
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_settlement"`);
    // 2
    await queryRunner.query(`DROP TABLE IF EXISTS "collateral_lock"`);
    // 1
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."settlement_workflow_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."collateral_lock_status_enum"`);
  }
}
