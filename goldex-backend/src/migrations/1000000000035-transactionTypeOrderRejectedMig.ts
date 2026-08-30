import { MigrationInterface, QueryRunner } from "typeorm";

// Adds ORDER_REJECTED so provider-rejected orders get a distinct transaction type.
export class TransactionTypeOrderRejectedMig1000000000035 implements MigrationInterface {
  name = "TransactionTypeOrderRejectedMig1000000000035";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "transaction_transaction_type_enum" ADD VALUE IF NOT EXISTS 'ORDER_REJECTED'`
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop an enum value; no-op.
  }
}
