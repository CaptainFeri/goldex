import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from "typeorm";

export class PacketMig1000000000046 implements MigrationInterface {
  name = "PacketMig1000000000046";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "packet_status_enum" AS ENUM ('PENDING', 'IN_WAREHOUSE', 'RELEASED', 'WITHDRAWN', 'ORPHAN')
    `);

    await queryRunner.createTable(
      new Table({
        name: "packet",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          { name: "warehouse_id", type: "uuid", isNullable: true },
          { name: "pure_weight", type: "decimal", precision: 20, scale: 8, isNullable: false },
          { name: "id_secure", type: "varchar", length: "255", isUnique: true, isNullable: false },
          { name: "date_time", type: "timestamptz", default: "NOW()" },
          { name: "delivery_time", type: "timestamptz", isNullable: true },
          { name: "status", type: "packet_status_enum", default: "'PENDING'" },
          { name: "warehouse_index_position", type: "varchar", length: "100", isNullable: true },
          { name: "ang", type: "decimal", precision: 10, scale: 4, isNullable: true },
          { name: "ayar", type: "decimal", precision: 10, scale: 4, isNullable: true },
          { name: "picture", type: "varchar", length: "500", isNullable: true },
          { name: "user_id", type: "uuid", isNullable: true },
          { name: "qr_code", type: "varchar", length: "500", isNullable: true },
          { name: "is_orphan", type: "boolean", default: false },
          { name: "batch_number", type: "varchar", length: "100", isNullable: true },
          { name: "metadata", type: "jsonb", isNullable: true },
          { name: "created_at", type: "timestamp", default: "CURRENT_TIMESTAMP" },
          { name: "updated_at", type: "timestamp", default: "CURRENT_TIMESTAMP", onUpdate: "CURRENT_TIMESTAMP" },
          { name: "deleted_at", type: "timestamp", isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      "packet",
      new TableForeignKey({
        columnNames: ["warehouse_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "warehouse",
        onDelete: "SET NULL",
      }),
    );

    await queryRunner.createForeignKey(
      "packet",
      new TableForeignKey({
        columnNames: ["user_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "user",
        onDelete: "SET NULL",
      }),
    );

    await queryRunner.createIndex(
      "packet",
      new TableIndex({
        name: "IDX_PACKET_WAREHOUSE_ID",
        columnNames: ["warehouse_id"],
      }),
    );

    await queryRunner.createIndex(
      "packet",
      new TableIndex({
        name: "IDX_PACKET_USER_ID",
        columnNames: ["user_id"],
      }),
    );

    await queryRunner.createIndex(
      "packet",
      new TableIndex({
        name: "IDX_PACKET_STATUS",
        columnNames: ["status"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("packet");
    if (table) {
      const warehouseFk = table.foreignKeys.find((fk) => fk.columnNames.indexOf("warehouse_id") !== -1);
      if (warehouseFk) await queryRunner.dropForeignKey("packet", warehouseFk);

      const userFk = table.foreignKeys.find((fk) => fk.columnNames.indexOf("user_id") !== -1);
      if (userFk) await queryRunner.dropForeignKey("packet", userFk);
    }

    await queryRunner.dropIndex("packet", "IDX_PACKET_WAREHOUSE_ID");
    await queryRunner.dropIndex("packet", "IDX_PACKET_USER_ID");
    await queryRunner.dropIndex("packet", "IDX_PACKET_STATUS");
    await queryRunner.dropTable("packet");
    await queryRunner.query(`DROP TYPE "packet_status_enum"`);
  }
}
