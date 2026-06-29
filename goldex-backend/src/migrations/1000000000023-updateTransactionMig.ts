import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from "typeorm";

export class UpdateTransactionOrderMig1000000000023 implements MigrationInterface {
  name?: "UpdateTransactionOrderMig1000000000023";
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("transaction");
    const orderIdColumn = table.columns.find((col) => col.name === "order_id");

    if (!orderIdColumn) {
      await queryRunner.addColumn(
        "transaction",
        new TableColumn({
          name: "order_id",
          type: "uuid",
          isNullable: true,
        })
      );
    }

    const foreignKey = new TableForeignKey({
      columnNames: ["order_id"],
      referencedColumnNames: ["id"],
      referencedTableName: "order",
      onDelete: "SET NULL",
      name: "FK_TRANSACTION_ORDER",
    });

    await queryRunner.createForeignKey("transaction", foreignKey);

    await queryRunner.createIndex(
      "transaction",
      new TableIndex({
        name: "IDX_TRANSACTION_ORDER_ID",
        columnNames: ["order_id"],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey("transaction", "FK_TRANSACTION_ORDER");

    await queryRunner.dropIndex("transaction", "IDX_TRANSACTION_ORDER_ID");

    await queryRunner.dropColumn("transaction", "order_id");
  }
}
