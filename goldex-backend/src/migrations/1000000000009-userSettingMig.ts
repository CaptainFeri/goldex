import { MigrationInterface, QueryRunner } from 'typeorm';

export class userSettingMig1000000000009 implements MigrationInterface {
  name?: 'userSettingMig1000000000009';
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "user_setting" 
          ("id"  SERIAL NOT NULL,
          "user_id" character varying,
          "default_language_id" integer DEFAULT 2, 
          "is_email_notification_enabled" boolean DEFAULT false,
          "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
          "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
          "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
          CONSTRAINT "PK_USER_SETTING" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "user_setting"`);
  }
}
