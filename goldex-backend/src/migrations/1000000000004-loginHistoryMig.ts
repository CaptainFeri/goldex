import { MigrationInterface, QueryRunner } from 'typeorm';

export class loginHistoryMig1000000000004 implements MigrationInterface {
  name?: 'loginHistoryMig1000000000004';
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "user_login_history" 
          ("id" UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
          "ip_address" character varying NOT NULL,
          "device_info" character varying NOT NULL, 
          "user_id" character varying NOT NULL, 
          "status" integer NOT null, 
          "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
          "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
          "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
          CONSTRAINT "PK_USER_LOGIN_HISTORY" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "user_login_history"`);
  }
}
