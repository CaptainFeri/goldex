import { MigrationInterface, QueryRunner } from 'typeorm';

export class refreshTokenMig1000000000014 implements MigrationInterface {
  name?: 'refreshTokenMig1000000000014';
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
        CREATE TABLE "user_refresh_token"
        ("id"  SERIAL NOT NULL,
        "user_id" UUID,
        "device_id" UUID,
        "token" character varying DEFAULT null,
        "expired_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        CONSTRAINT "PK_USER_REFRESH_TOKEN" PRIMARY KEY ("id")
        )`);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "user_refresh_token"`);
  }
}
