import { MigrationInterface, QueryRunner } from "typeorm";

export class discountMig1000000000010 implements MigrationInterface {
  name?: "discountMig1000000000010";
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`CREATE TABLE "discount_coupon"
        ("id"  SERIAL NOT NULL,
        "code" character varying NOT NULL,
        "coupon_type" character varying NOT NULL,
        "discount_amount" DECIMAL(22,2) DEFAULT 0,
        "discount_percentage" DECIMAL(22,2) DEFAULT 0,
        "max_discount" integer NULL,
        "usage_count" integer NOT NULL,
        "usage_limit" integer NOT NULL,
        "is_active" boolean NOT NULL,
        "expired_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "admin_id" character varying NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        CONSTRAINT "PK_DISCOUNT_COUPON" PRIMARY KEY ("id"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "discount_coupon"`);
  }
}
