import { MigrationInterface, QueryRunner } from "typeorm";

export class userTelegramMig1000000000053 implements MigrationInterface {
  name = "userTelegramMig1000000000053";

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "user_telegram" (
        "id" UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        "telegram_id" bigint NOT NULL UNIQUE,
        "user_id" UUID NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        CONSTRAINT "PK_USER_TELEGRAM" PRIMARY KEY ("id"),
        CONSTRAINT "FK_USER_TELEGRAM_USER" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_USER_TELEGRAM_TELEGRAM_ID" ON "user_telegram" ("telegram_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP INDEX "IDX_USER_TELEGRAM_TELEGRAM_ID"`);
    await queryRunner.query(`DROP TABLE "user_telegram"`);
  }
}
