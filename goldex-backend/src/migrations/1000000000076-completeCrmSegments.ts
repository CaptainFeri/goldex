import { MigrationInterface, QueryRunner } from "typeorm";

export class CompleteCrmSegments1000000000076 implements MigrationInterface {
  name = "CompleteCrmSegments1000000000076";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer_segments" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."customer_segment_combinations_operator_enum" AS ENUM ('UNION', 'INTERSECT', 'DIFFERENCE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_segment_combinations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "description" text,
        "segment_ids" jsonb NOT NULL,
        "operator" "public"."customer_segment_combinations_operator_enum" NOT NULL,
        "created_by" uuid,
        "last_synced_at" timestamptz,
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now(),
        CONSTRAINT "PK_customer_segment_combinations" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_segment_combinations" ADD CONSTRAINT "FK_customer_segment_combinations_admin" FOREIGN KEY ("created_by") REFERENCES "admin"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_segment_combinations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."customer_segment_combinations_operator_enum"`);
    await queryRunner.query(`ALTER TABLE "customer_segments" DROP COLUMN IF EXISTS "last_synced_at"`);
  }
}