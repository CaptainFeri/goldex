import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class WarehouseMig1000000000045 implements MigrationInterface {
  name = "WarehouseMig1000000000045";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "warehouse_status_enum" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'FULL')
    `);

    await queryRunner.createTable(
      new Table({
        name: "warehouse",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          { name: "name", type: "varchar", length: "255", isNullable: false },
          { name: "description", type: "text", isNullable: true },
          { name: "location", type: "varchar", length: "255", isNullable: true },
          { name: "capacity_total", type: "decimal", precision: 20, scale: 8, default: 0 },
          { name: "capacity_used", type: "decimal", precision: 20, scale: 8, default: 0 },
          { name: "capacity_remaining", type: "decimal", precision: 20, scale: 8, default: 0 },
          { name: "delivery_dates", type: "jsonb", isNullable: true },
          { name: "time_limit", type: "varchar", length: "100", isNullable: true },
          { name: "status", type: "warehouse_status_enum", default: "'ACTIVE'" },
          { name: "created_at", type: "timestamp", default: "CURRENT_TIMESTAMP" },
          { name: "updated_at", type: "timestamp", default: "CURRENT_TIMESTAMP", onUpdate: "CURRENT_TIMESTAMP" },
          { name: "deleted_at", type: "timestamp", isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "warehouse",
      new TableIndex({
        name: "IDX_WAREHOUSE_STATUS",
        columnNames: ["status"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("warehouse", "IDX_WAREHOUSE_STATUS");
    await queryRunner.dropTable("warehouse");
    await queryRunner.query(`DROP TYPE "warehouse_status_enum"`);
  }
}
