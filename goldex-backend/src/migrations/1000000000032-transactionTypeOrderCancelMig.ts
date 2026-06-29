import { MigrationInterface, QueryRunner } from "typeorm";

// Adds ORDER_CANCEL to the transaction_type enum so cancelled orders record a
// dedicated transaction type (positive refund) instead of the generic ORDER.
export class TransactionTypeOrderCancelMig1000000000032 implements MigrationInterface {
  name = "TransactionTypeOrderCancelMig1000000000032";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres 12+ supports ADD VALUE inside a transaction.
    await queryRunner.query(
      `ALTER TYPE "transaction_transaction_type_enum" ADD VALUE IF NOT EXISTS 'ORDER_CANCEL'`
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop a value from an enum type; intentionally a no-op.
  }
}
