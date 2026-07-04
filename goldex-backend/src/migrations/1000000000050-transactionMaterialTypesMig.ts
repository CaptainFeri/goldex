import { MigrationInterface, QueryRunner } from "typeorm";

// Adds MATERIAL_DEPOSIT and MATERIAL_WITHDRAW to transaction_type enum
// for warehouse deposit/withdraw request transactions.
export class TransactionMaterialTypesMig1000000000050 implements MigrationInterface {
  name = "TransactionMaterialTypesMig1000000000050";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "transaction_transaction_type_enum" ADD VALUE IF NOT EXISTS 'MATERIAL_DEPOSIT'`
    );
    await queryRunner.query(
      `ALTER TYPE "transaction_transaction_type_enum" ADD VALUE IF NOT EXISTS 'MATERIAL_WITHDRAW'`
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop a value from an enum type; intentionally a no-op.
  }
}
