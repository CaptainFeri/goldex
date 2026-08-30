import { MigrationInterface, QueryRunner } from "typeorm";

export class userMig1000000000001 implements MigrationInterface {
  name?: "userMig1000000000001";
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "user" 
        ("id" UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        "first_name" character varying DEFAULT null,
        "last_name" character varying DEFAULT null,
        "password" character varying DEFAULT null, 
        "email" character varying NOT NULL, 
        "email_verified_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        "two_factor_activated_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        "registered_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        "blocked_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        "role" integer NOT NULL,
        "two_factor_secret" character varying DEFAULT null,
        "referral_code" character varying,
        "phone" character varying,
        "referral_id" character varying,
        "two_factor_url" character varying DEFAULT null,
        "is_authenticated_by_google" boolean DEFAULT false,
        "profile_id" UUID NOT NULL UNIQUE, 
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        CONSTRAINT "PK_USER" PRIMARY KEY ("id"))`
    );

    await queryRunner.query(
      `CREATE TABLE "user_profile" 
        ("id" UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        "postal_code" character varying DEFAULT null,
        "avatar_img_path" character varying DEFAULT null,
        "address" character varying DEFAULT null,
        "gender" integer DEFAULT 0, 
        "country_id" integer DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
        "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        CONSTRAINT "PK_USER_PROFILE" PRIMARY KEY ("id"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TABLE "user_profile"`);
  }
}
