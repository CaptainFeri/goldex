import { MigrationInterface, QueryRunner } from "typeorm";

export class quoteRequestMig1000000000054 implements MigrationInterface {
  name = "quoteRequestMig1000000000054";

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "quote_request" (
        "id" UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "price_pair_id" UUID NOT NULL,
        "side" "order_side_enum" NOT NULL,
        "quantity" DECIMAL(20,8) NOT NULL,
        "price" DECIMAL(20,8),
        "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "matched_user_id" UUID,
        "matched_at" TIMESTAMP,
        "notes" TEXT,
        "channel_chat_id" VARCHAR(255),
        "channel_message_id" VARCHAR(255),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
        CONSTRAINT "PK_QUOTE_REQUEST" PRIMARY KEY ("id"),
        CONSTRAINT "FK_QUOTE_REQUEST_USER" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_QUOTE_REQUEST_PAIR" FOREIGN KEY ("price_pair_id") REFERENCES "price_pairs"("id") ON DELETE CASCADE
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "quote_request"`);
  }
}
