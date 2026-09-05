import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositWithdrawTablesMig1000000000062 implements MigrationInterface {
  name = "DepositWithdrawTablesMig1000000000062";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."deposit_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')`);
    await queryRunner.query(`CREATE TYPE "public"."withdraw_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deposit" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "user_id" uuid NOT NULL,
        "symbol_id" uuid NOT NULL,
        "type" character varying NOT NULL,
        "amount" decimal(20,8) NOT NULL,
        "status" "public"."deposit_status_enum" NOT NULL DEFAULT 'PENDING',
        "admin_id" character varying,
        "notes" character varying,
        "metadata" jsonb,
        "completed_at" TIMESTAMP,
        CONSTRAINT "PK_deposit_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "withdraw" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "user_id" uuid NOT NULL,
        "symbol_id" uuid NOT NULL,
        "type" character varying NOT NULL,
        "amount" decimal(20,8) NOT NULL,
        "status" "public"."withdraw_status_enum" NOT NULL DEFAULT 'PENDING',
        "admin_id" character varying,
        "notes" character varying,
        "metadata" jsonb,
        "completed_at" TIMESTAMP,
        CONSTRAINT "PK_withdraw_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "withdraw"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."withdraw_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."deposit_status_enum"`);
  }
}
