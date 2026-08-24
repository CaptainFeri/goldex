import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the SUSPENDED status to credit_status_enum and the new admin lifecycle
 * actions to finance_log_action_type_enum.
 *
 * ALTER TYPE ... ADD VALUE must run outside a transaction on PostgreSQL < 12,
 * so this migration is executed without transactional wrapping.
 */
export class CreditSuspendMig1000000000082 implements MigrationInterface {
  name = "CreditSuspendMig1000000000082";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."credit_status_enum" ADD VALUE IF NOT EXISTS 'SUSPENDED'`
    );
    await queryRunner.query(
      `ALTER TYPE "public"."finance_log_action_type_enum" ADD VALUE IF NOT EXISTS 'CREDIT_SUSPENDED'`
    );
    await queryRunner.query(
      `ALTER TYPE "public"."finance_log_action_type_enum" ADD VALUE IF NOT EXISTS 'CREDIT_REACTIVATED'`
    );
    await queryRunner.query(
      `ALTER TYPE "public"."finance_log_action_type_enum" ADD VALUE IF NOT EXISTS 'CREDIT_EXTENDED'`
    );
    await queryRunner.query(
      `ALTER TYPE "public"."finance_log_action_type_enum" ADD VALUE IF NOT EXISTS 'CREDIT_LIMIT_ADJUSTED'`
    );
    await queryRunner.query(
      `ALTER TYPE "public"."finance_log_action_type_enum" ADD VALUE IF NOT EXISTS 'CREDIT_FORCE_LIQUIDATED'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping enum values is not supported by PostgreSQL; a type recreation
    // would be required to roll back. No-op down.
  }
}
