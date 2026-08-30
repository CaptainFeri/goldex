import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class OrderQuoteFieldsMig1000000000052 implements MigrationInterface {
  name = "OrderQuoteFieldsMig1000000000052";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add QUOTE to order_type enum
    await queryRunner.query(`
      ALTER TYPE "order_type_enum" ADD VALUE IF NOT EXISTS 'QUOTE'
    `);

    const table = await queryRunner.getTable("order");

    if (table && !table.findColumnByName("conditions")) {
      await queryRunner.addColumn(
        "order",
        new TableColumn({ name: "conditions", type: "text", isNullable: true }),
      );
    }

    if (table && !table.findColumnByName("telegram_channel_message_id")) {
      await queryRunner.addColumn(
        "order",
        new TableColumn({ name: "telegram_channel_message_id", type: "varchar", length: "255", isNullable: true }),
      );
    }

    if (table && !table.findColumnByName("matched_order_id")) {
      await queryRunner.addColumn(
        "order",
        new TableColumn({ name: "matched_order_id", type: "varchar", length: "255", isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("order");

    if (table && table.findColumnByName("conditions")) {
      await queryRunner.dropColumn("order", "conditions");
    }

    if (table && table.findColumnByName("telegram_channel_message_id")) {
      await queryRunner.dropColumn("order", "telegram_channel_message_id");
    }

    if (table && table.findColumnByName("matched_order_id")) {
      await queryRunner.dropColumn("order", "matched_order_id");
    }
  }
}
