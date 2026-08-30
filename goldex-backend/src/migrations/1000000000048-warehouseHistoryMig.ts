import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class WarehouseHistoryMig1000000000048 implements MigrationInterface {
  name = "WarehouseHistoryMig1000000000048";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "warehouse_history",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "warehouse_id", type: "uuid", isNullable: true },
          { name: "packet_id", type: "uuid", isNullable: true },
          { name: "request_id", type: "uuid", isNullable: true },
          { name: "action", type: "varchar", length: "100", isNullable: false },
          { name: "description", type: "text", isNullable: true },
          { name: "performed_by", type: "varchar", length: "100", isNullable: true },
          { name: "performed_role", type: "varchar", length: "50", isNullable: true },
          { name: "metadata", type: "jsonb", isNullable: true },
          { name: "created_at", type: "timestamp", default: "CURRENT_TIMESTAMP" },
          { name: "updated_at", type: "timestamp", default: "CURRENT_TIMESTAMP", onUpdate: "CURRENT_TIMESTAMP" },
          { name: "deleted_at", type: "timestamp", isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "warehouse_history",
      new TableIndex({
        name: "IDX_WAREHOUSE_HISTORY_WAREHOUSE_ID",
        columnNames: ["warehouse_id"],
      }),
    );

    await queryRunner.createIndex(
      "warehouse_history",
      new TableIndex({
        name: "IDX_WAREHOUSE_HISTORY_PACKET_ID",
        columnNames: ["packet_id"],
      }),
    );

    await queryRunner.createIndex(
      "warehouse_history",
      new TableIndex({
        name: "IDX_WAREHOUSE_HISTORY_REQUEST_ID",
        columnNames: ["request_id"],
      }),
    );

    await queryRunner.createIndex(
      "warehouse_history",
      new TableIndex({
        name: "IDX_WAREHOUSE_HISTORY_ACTION",
        columnNames: ["action"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("warehouse_history", "IDX_WAREHOUSE_HISTORY_WAREHOUSE_ID");
    await queryRunner.dropIndex("warehouse_history", "IDX_WAREHOUSE_HISTORY_PACKET_ID");
    await queryRunner.dropIndex("warehouse_history", "IDX_WAREHOUSE_HISTORY_REQUEST_ID");
    await queryRunner.dropIndex("warehouse_history", "IDX_WAREHOUSE_HISTORY_ACTION");
    await queryRunner.dropTable("warehouse_history");
  }
}
