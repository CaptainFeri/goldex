import { MigrationInterface, QueryRunner } from "typeorm";

export class adminMig1000000000002 implements MigrationInterface {
  name?: "adminMig1000000000002";
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    // Create admin table with all fields
    await queryRunner.query(
      `CREATE TABLE "admin" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying NOT NULL,
        "hash_password" character varying NOT NULL,
        "role" character varying NOT NULL,
        "is_suspended" boolean NOT NULL DEFAULT false,
        "suspended_at" TIMESTAMP WITH TIME ZONE,
        "suspended_by" UUID,
        "last_login_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_admin_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_email" UNIQUE ("email")
      )`
    );

    // Create index on email for faster lookups
    await queryRunner.query(`CREATE INDEX "IDX_ADMIN_EMAIL" ON "admin" ("email") WHERE "deleted_at" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "admin"`);
  }
}
