import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositWithdrawPictureMig1000000000063 implements MigrationInterface {
  name = "DepositWithdrawPictureMig1000000000063";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "deposit" ADD COLUMN IF NOT EXISTS "picture_path" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "withdraw" ADD COLUMN IF NOT EXISTS "picture_path" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deposit" DROP COLUMN IF EXISTS "picture_path"`);
    await queryRunner.query(`ALTER TABLE "withdraw" DROP COLUMN IF EXISTS "picture_path"`);
  }
}
