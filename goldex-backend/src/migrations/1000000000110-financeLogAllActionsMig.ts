import { MigrationInterface, QueryRunner } from "typeorm";
import { FinanceActionEnum } from "../finance-log/enum/finance-action.enum";

/**
 * The finance log now records every money movement on the platform, not just
 * credit actions, so `finance_log_action_type_enum` has to carry the rest of the
 * taxonomy. The credit values it already holds are unchanged — existing rows
 * keep reading exactly as before.
 *
 * Values are added from `FinanceActionEnum` itself rather than a list repeated
 * here, so a new action can never be usable in code but missing in the database.
 * Postgres cannot drop an enum value, so `down` is a no-op: the added labels are
 * harmless to leave, and removing them would mean rebuilding the type and every
 * column that uses it.
 */
export class FinanceLogAllActionsMig1000000000110 implements MigrationInterface {
  name = "FinanceLogAllActionsMig1000000000110";

  private static readonly ENUM = "finance_log_action_type_enum";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = $1`,
      [FinanceLogAllActionsMig1000000000110.ENUM],
    );
    if (!exists?.length) return;

    for (const value of Object.values(FinanceActionEnum)) {
      // ADD VALUE IF NOT EXISTS is idempotent, and safe inside a transaction on
      // PG 12+ as long as the new label is not used in that same transaction.
      await queryRunner.query(
        `ALTER TYPE "public"."${FinanceLogAllActionsMig1000000000110.ENUM}" ` +
          `ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  public async down(): Promise<void> {
    // Intentionally empty — see the note above.
  }
}
