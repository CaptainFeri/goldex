import { MigrationInterface, QueryRunner } from "typeorm";

export class CreditExecutionLevelMig1000000000060 implements MigrationInterface {
  name = "CreditExecutionLevelMig1000000000060";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='credit' AND column_name='max_execution_trade_level') THEN
          ALTER TABLE "credit" ADD COLUMN "max_execution_trade_level" integer;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='credit' AND column_name='executed_trade_level') THEN
          ALTER TABLE "credit" ADD COLUMN "executed_trade_level" integer NOT NULL DEFAULT 0;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "executed_trade_level"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP COLUMN "max_execution_trade_level"`);
  }
}
