import { MigrationInterface, QueryRunner } from "typeorm";

export class user2faSettingMig1000000000012 implements MigrationInterface {
  name?: "user2faSettingMig1000000000012";
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
        CREATE TABLE "user_2fa_setting"
        ("id"  SERIAL NOT NULL,
        "user_id" UUID,
        "withdrawal_activated_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        "login_activated_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        CONSTRAINT "PK_USER_2FA_SETTING" PRIMARY KEY ("id")
        )`);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "user_2fa_setting"`);
  }
}
