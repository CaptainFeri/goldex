import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveCreditExecutionLevelMig1000000000088 implements MigrationInterface {
  name = "RemoveCreditExecutionLevelMig1000000000088";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN IF EXISTS "executed_trade_level"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN IF EXISTS "max_execution_trade_level"`);
    await queryRunner.query(`ALTER TABLE "user_level" DROP COLUMN IF EXISTS "credit_max_execution_level"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN IF NOT EXISTS "max_execution_trade_level" integer`);
    await queryRunner.query(`ALTER TABLE "credit" ADD COLUMN IF NOT EXISTS "executed_trade_level" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "user_level" ADD COLUMN IF NOT EXISTS "credit_max_execution_level" integer`);
  }
}
