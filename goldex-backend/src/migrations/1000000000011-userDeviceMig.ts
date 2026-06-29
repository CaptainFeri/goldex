import { MigrationInterface, QueryRunner } from "typeorm";

export class userDeviceMig1000000000011 implements MigrationInterface {
  name?: "userDeviceMig1000000000011";
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
        CREATE TABLE "user_device"
        ("id" UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        "ip_address" character varying NOT NULL,
        "device_id" character varying NOT NULL,
        "device_type" character varying NOT NULL,
        "user_id" UUID,
        "user_agent" character varying NOT NULL,
        "last_login" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        CONSTRAINT "PK_USER_DEVICE" PRIMARY KEY ("id")
        )`);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "user_device"`);
  }
}
