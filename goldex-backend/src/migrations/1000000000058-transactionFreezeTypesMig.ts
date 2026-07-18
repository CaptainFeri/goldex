import { MigrationInterface, QueryRunner } from "typeorm";

// Adds MATERIAL_FREEZE and MATERIAL_UNFREEZE to transaction_transaction_type_enum
// for credit collateral freeze/unfreeze transaction records.
export class TransactionFreezeTypesMig1000000000058 implements MigrationInterface {
  name = "TransactionFreezeTypesMig1000000000058";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."transaction_transaction_type_enum" ADD VALUE IF NOT EXISTS 'MATERIAL_FREEZE'`
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transaction_transaction_type_enum" ADD VALUE IF NOT EXISTS 'MATERIAL_UNFREEZE'`
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop a value from an enum type; intentionally a no-op.
  }
}
