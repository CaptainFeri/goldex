import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class QuoteRequestChannelMig1000000000055 implements MigrationInterface {
  name = "QuoteRequestChannelMig1000000000055";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("quote_request");
    if (table) {
      if (!table.findColumnByName("channel_chat_id")) {
        await queryRunner.addColumn(
          "quote_request",
          new TableColumn({ name: "channel_chat_id", type: "varchar", length: "255", isNullable: true }),
        );
      }
      if (!table.findColumnByName("channel_message_id")) {
        await queryRunner.addColumn(
          "quote_request",
          new TableColumn({ name: "channel_message_id", type: "varchar", length: "255", isNullable: true }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("quote_request");
    if (table) {
      if (table.findColumnByName("channel_chat_id")) {
        await queryRunner.dropColumn("quote_request", "channel_chat_id");
      }
      if (table.findColumnByName("channel_message_id")) {
        await queryRunner.dropColumn("quote_request", "channel_message_id");
      }
    }
  }
}
