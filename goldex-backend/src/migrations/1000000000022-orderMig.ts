import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey, TableColumn } from "typeorm";

export class OrderMig1000000000022 implements MigrationInterface {
  name?: "OrderMig1000000000022";
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "order_side_enum" AS ENUM ('BUY', 'SELL')
    `);

    await queryRunner.query(`
      CREATE TYPE "order_type_enum" AS ENUM ('MARKET', 'LIMIT')
    `);

    await queryRunner.query(`
      CREATE TYPE "order_status_enum" AS ENUM ('PENDING', 'PARTIALLY_COMPLETED', 'COMPLETED', 'CANCELLED', 'REJECTED')
    `);

    // Create order table
    await queryRunner.createTable(
      new Table({
        name: "order",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          { name: "user_id", type: "uuid", isNullable: false },
          { name: "price_pair_id", type: "uuid", isNullable: false },
          { name: "order_code", type: "varchar", length: "50", isUnique: true, isNullable: false },
          { name: "side", type: "order_side_enum", isNullable: false },
          { name: "order_type", type: "order_type_enum", isNullable: false },
          { name: "status", type: "order_status_enum", isNullable: false, default: "'PENDING'" },
          { name: "quantity", type: "decimal", precision: 20, scale: 8, isNullable: false },
          { name: "executed_quantity", type: "decimal", precision: 20, scale: 8, isNullable: false, default: 0 },
          { name: "price", type: "decimal", precision: 20, scale: 8, isNullable: true },
          { name: "average_price", type: "decimal", precision: 20, scale: 8, isNullable: false, default: 0 },
          { name: "total_value", type: "decimal", precision: 20, scale: 8, isNullable: false, default: 0 },
          { name: "commission", type: "decimal", precision: 10, scale: 2, isNullable: false, default: 0 },
          { name: "completed_at", type: "timestamp", isNullable: true },
          { name: "cancelled_at", type: "timestamp", isNullable: true },
          { name: "notes", type: "text", isNullable: true },
          { name: "metadata", type: "jsonb", isNullable: true },
          { name: "created_at", type: "timestamp", default: "CURRENT_TIMESTAMP" },
          { name: "updated_at", type: "timestamp", default: "CURRENT_TIMESTAMP", onUpdate: "CURRENT_TIMESTAMP" },
          { name: "deleted_at", type: "timestamp", isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      "order",
      new TableIndex({
        name: "IDX_ORDER_USER_ID",
        columnNames: ["user_id"],
      })
    );

    await queryRunner.createIndex(
      "order",
      new TableIndex({
        name: "IDX_ORDER_PRICE_PAIR_ID",
        columnNames: ["price_pair_id"],
      })
    );

    await queryRunner.createIndex(
      "order",
      new TableIndex({
        name: "IDX_ORDER_STATUS",
        columnNames: ["status"],
      })
    );

    await queryRunner.createIndex(
      "order",
      new TableIndex({
        name: "IDX_ORDER_USER_STATUS",
        columnNames: ["user_id", "status"],
      })
    );

    await queryRunner.createIndex(
      "order",
      new TableIndex({
        name: "IDX_ORDER_CREATED_AT",
        columnNames: ["created_at"],
      })
    );

    await queryRunner.createIndex(
      "order",
      new TableIndex({
        name: "IDX_ORDER_ORDER_CODE",
        columnNames: ["order_code"],
      })
    );

    await queryRunner.createForeignKey(
      "order",
      new TableForeignKey({
        columnNames: ["user_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "user",
        onDelete: "CASCADE",
        name: "FK_ORDER_USER",
      })
    );

    await queryRunner.createForeignKey(
      "order",
      new TableForeignKey({
        columnNames: ["price_pair_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "price_pairs",
        onDelete: "CASCADE",
        name: "FK_ORDER_PRICE_PAIR",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey("order", "FK_ORDER_PRICE_PAIR");
    await queryRunner.dropForeignKey("order", "FK_ORDER_USER");

    await queryRunner.dropIndex("order", "IDX_ORDER_ORDER_CODE");
    await queryRunner.dropIndex("order", "IDX_ORDER_CREATED_AT");
    await queryRunner.dropIndex("order", "IDX_ORDER_USER_STATUS");
    await queryRunner.dropIndex("order", "IDX_ORDER_STATUS");
    await queryRunner.dropIndex("order", "IDX_ORDER_PRICE_PAIR_ID");
    await queryRunner.dropIndex("order", "IDX_ORDER_USER_ID");

    await queryRunner.dropTable("order");

    await queryRunner.query(`DROP TYPE "order_status_enum"`);
    await queryRunner.query(`DROP TYPE "order_type_enum"`);
    await queryRunner.query(`DROP TYPE "order_side_enum"`);
  }
}
