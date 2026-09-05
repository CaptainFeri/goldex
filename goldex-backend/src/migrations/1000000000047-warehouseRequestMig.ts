import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from "typeorm";

export class WarehouseRequestMig1000000000047 implements MigrationInterface {
  name = "WarehouseRequestMig1000000000047";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "warehouse_request_type_enum" AS ENUM ('INPUT', 'OUTPUT')
    `);

    await queryRunner.query(`
      CREATE TYPE "warehouse_request_status_enum" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED')
    `);

    await queryRunner.createTable(
      new Table({
        name: "warehouse_request",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          { name: "type", type: "warehouse_request_type_enum", isNullable: false },
          { name: "status", type: "warehouse_request_status_enum", default: "'PENDING'" },
          { name: "user_id", type: "uuid", isNullable: false },
          { name: "packet_id", type: "uuid", isNullable: true },
          { name: "warehouse_id", type: "uuid", isNullable: false },
          { name: "admin_id", type: "uuid", isNullable: true },
          { name: "weight", type: "decimal", precision: 20, scale: 8, isNullable: false },
          { name: "delivery_date", type: "timestamptz", isNullable: true },
          { name: "delivery_time", type: "varchar", length: "100", isNullable: true },
          { name: "delivery_location", type: "varchar", length: "500", isNullable: true },
          { name: "notes", type: "text", isNullable: true },
          { name: "processed_at", type: "timestamptz", isNullable: true },
          { name: "metadata", type: "jsonb", isNullable: true },
          { name: "created_at", type: "timestamp", default: "CURRENT_TIMESTAMP" },
          { name: "updated_at", type: "timestamp", default: "CURRENT_TIMESTAMP", onUpdate: "CURRENT_TIMESTAMP" },
          { name: "deleted_at", type: "timestamp", isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      "warehouse_request",
      new TableForeignKey({
        columnNames: ["user_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "user",
        onDelete: "SET NULL",
      }),
    );

    await queryRunner.createForeignKey(
      "warehouse_request",
      new TableForeignKey({
        columnNames: ["packet_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "packet",
        onDelete: "SET NULL",
      }),
    );

    await queryRunner.createForeignKey(
      "warehouse_request",
      new TableForeignKey({
        columnNames: ["warehouse_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "warehouse",
        onDelete: "SET NULL",
      }),
    );

    await queryRunner.createForeignKey(
      "warehouse_request",
      new TableForeignKey({
        columnNames: ["admin_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "admin",
        onDelete: "SET NULL",
      }),
    );

    await queryRunner.createIndex(
      "warehouse_request",
      new TableIndex({
        name: "IDX_WAREHOUSE_REQUEST_USER_ID",
        columnNames: ["user_id"],
      }),
    );

    await queryRunner.createIndex(
      "warehouse_request",
      new TableIndex({
        name: "IDX_WAREHOUSE_REQUEST_WAREHOUSE_ID",
        columnNames: ["warehouse_id"],
      }),
    );

    await queryRunner.createIndex(
      "warehouse_request",
      new TableIndex({
        name: "IDX_WAREHOUSE_REQUEST_STATUS",
        columnNames: ["status"],
      }),
    );

    await queryRunner.createIndex(
      "warehouse_request",
      new TableIndex({
        name: "IDX_WAREHOUSE_REQUEST_TYPE",
        columnNames: ["type"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("warehouse_request");
    if (table) {
      const foreignKeys = table.foreignKeys.filter((fk) =>
        ["user_id", "packet_id", "warehouse_id", "admin_id"].some((col) => fk.columnNames.indexOf(col) !== -1),
      );
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey("warehouse_request", fk);
      }
    }

    await queryRunner.dropIndex("warehouse_request", "IDX_WAREHOUSE_REQUEST_USER_ID");
    await queryRunner.dropIndex("warehouse_request", "IDX_WAREHOUSE_REQUEST_WAREHOUSE_ID");
    await queryRunner.dropIndex("warehouse_request", "IDX_WAREHOUSE_REQUEST_STATUS");
    await queryRunner.dropIndex("warehouse_request", "IDX_WAREHOUSE_REQUEST_TYPE");
    await queryRunner.dropTable("warehouse_request");
    await queryRunner.query(`DROP TYPE "warehouse_request_type_enum"`);
    await queryRunner.query(`DROP TYPE "warehouse_request_status_enum"`);
  }
}
