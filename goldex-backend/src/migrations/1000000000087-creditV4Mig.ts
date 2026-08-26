import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Credit v4 (handoff credit_trading_handoff_fa_final.docx, revision 1):
 *  - settlement workflow stages: admin approval, valuation, method, funding
 *  - facility settlement policy (approval required, enabled methods, netting)
 */
export class CreditV4Mig1000000000087 implements MigrationInterface {
  name = "CreditV4Mig1000000000087";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 0. Extend the settlement_workflow_status_enum with the revised states ──
    const newStates = [
      "PENDING_ADMIN_REVIEW",
      "APPROVED",
      "VALUATED",
      "METHOD_SELECTED",
      "FUNDING_REQUIRED",
      "READY",
      "REJECTED",
    ];
    for (const state of newStates) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_workflow_status_enum') THEN
            ALTER TYPE "public"."settlement_workflow_status_enum" ADD VALUE IF NOT EXISTS '${state}';
          END IF;
        END $$;
      `);
    }

    // ── 1. credit_settlement workflow columns ─────────────────────────────
    const sw = [
      `"settlement_method" varchar(20)`,
      `"valuation_state" varchar(40)`,
      `"collateral_value" numeric(20,8) NOT NULL DEFAULT 0`,
      `"exposure_value" numeric(20,8) NOT NULL DEFAULT 0`,
      `"shortfall" numeric(20,8) NOT NULL DEFAULT 0`,
      `"required_top_up" numeric(20,8) NOT NULL DEFAULT 0`,
      `"funded_amount" numeric(20,8) NOT NULL DEFAULT 0`,
      `"release_amount" numeric(20,8) NOT NULL DEFAULT 0`,
      `"realized_pnl" numeric(20,8) NOT NULL DEFAULT 0`,
      `"final_collateral_state" jsonb`,
      `"approved_by" varchar(50)`,
      `"approved_at" timestamptz`,
      `"approval_reason" text`,
      `"rejected_by" varchar(50)`,
      `"rejected_at" timestamptz`,
      `"rejection_reason" text`,
    ];
    for (const col of sw) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'credit_settlement' AND column_name = '${col.split(" ")[0].replace(/"/g, "")}'
          ) THEN
            ALTER TABLE "credit_settlement" ADD COLUMN ${col};
          END IF;
        END $$;
      `);
    }

    // ── 2. credit settlement-policy columns ───────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'credit' AND column_name = 'require_admin_approval_for_settlement') THEN
          ALTER TABLE "credit" ADD COLUMN "require_admin_approval_for_settlement" boolean NOT NULL DEFAULT false;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'credit' AND column_name = 'settlement_methods') THEN
          ALTER TABLE "credit" ADD COLUMN "settlement_methods" jsonb NOT NULL DEFAULT '["FULL","NET","TOPUP"]'::jsonb;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'credit' AND column_name = 'netting_enabled') THEN
          ALTER TABLE "credit" ADD COLUMN "netting_enabled" boolean NOT NULL DEFAULT false;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "netting_enabled"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "settlement_methods"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "require_admin_approval_for_settlement"`);

    const cols = [
      "rejection_reason", "rejected_at", "rejected_by", "approval_reason",
      "approved_at", "approved_by", "final_collateral_state", "realized_pnl",
      "release_amount", "funded_amount", "required_top_up", "shortfall",
      "exposure_value", "collateral_value", "valuation_state", "settlement_method",
    ];
    for (const c of cols) {
      await queryRunner.query(`ALTER TABLE "credit_settlement" DROP COLUMN "${c}"`);
    }
  }
}