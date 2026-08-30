import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from "typeorm";

export class pricePairsMig1000000000018 implements MigrationInterface {
  name?: "pricePairsMig1000000000018";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.createTable(
      new Table({
        name: "price_pairs",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            onUpdate: "CURRENT_TIMESTAMP",
          },
          {
            name: "deleted_at",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "base_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "quote_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "price",
            type: "decimal",
            precision: 20,
            scale: 8,
            isNullable: true,
          },
          {
            name: "last_updated",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "is_valid",
            type: "boolean",
            default: false,
          },
          {
            name: "buy_commission",
            type: "decimal",
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: "sell_commission",
            type: "decimal",
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: "trading_view_symbol",
            type: "varchar",
            length: "50",
            isNullable: true,
          },
          {
            name: "min_buy",
            type: "decimal",
            precision: 20,
            scale: 8,
            isNullable: true,
          },
          {
            name: "max_buy",
            type: "decimal",
            precision: 20,
            scale: 8,
            isNullable: true,
          },
          {
            name: "min_sell",
            type: "decimal",
            precision: 20,
            scale: 8,
            isNullable: true,
          },
          {
            name: "max_sell",
            type: "decimal",
            precision: 20,
            scale: 8,
            isNullable: true,
          },
          {
            name: "decimals",
            type: "int",
            default: 2,
          },
          {
            name: "market_type",
            type: "enum",
            enum: ["formal", "informal"],
            default: "'formal'",
          },
        ],
      }),
      true
    );

    // Create unique index on base_code + quote_code
    await queryRunner.createIndex(
      "price_pairs",
      new TableIndex({
        name: "IDX_PRICE_PAIRS_BASE_QUOTE",
        columnNames: ["base_id", "quote_id"],
        isUnique: true,
      })
    );

    new TableForeignKey({
      name: "FK_PRICE_PAIRS_BASE_SYMBOL",
      columnNames: ["base_id"],
      referencedTableName: "symbol",
      referencedColumnNames: ["id"], // Changed from "code" to "id"
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    // Create foreign key for quote_symbol - FIXED: Added onDelete CASCADE and correct column name
    await queryRunner.createForeignKey(
      "price_pairs",
      new TableForeignKey({
        name: "FK_PRICE_PAIRS_QUOTE_SYMBOL",
        columnNames: ["quote_id"],
        referencedTableName: "symbol",
        referencedColumnNames: ["id"], // Assuming symbol has 'code' column
        onDelete: "CASCADE", // Matches entity: { onDelete: "CASCADE" }
        onUpdate: "CASCADE",
      })
    );

    // Additional indexes for performance
    await queryRunner.createIndex(
      "price_pairs",
      new TableIndex({
        name: "IDX_PRICE_PAIRS_BASE_CODE",
        columnNames: ["base_id"],
      })
    );

    await queryRunner.createIndex(
      "price_pairs",
      new TableIndex({
        name: "IDX_PRICE_PAIRS_QUOTE_CODE",
        columnNames: ["quote_id"],
      })
    );

    await queryRunner.createIndex(
      "price_pairs",
      new TableIndex({
        name: "IDX_PRICE_PAIRS_MARKET_TYPE",
        columnNames: ["market_type"],
      })
    );

    await queryRunner.createIndex(
      "price_pairs",
      new TableIndex({
        name: "IDX_PRICE_PAIRS_IS_VALID",
        columnNames: ["is_valid"],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("price_pairs");
    if (table) {
      const foreignKeys = table.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey("price_pairs", foreignKey);
      }
    }

    await queryRunner.dropIndex("price_pairs", "IDX_PRICE_PAIRS_BASE_QUOTE");
    await queryRunner.dropIndex("price_pairs", "IDX_PRICE_PAIRS_BASE_CODE");
    await queryRunner.dropIndex("price_pairs", "IDX_PRICE_PAIRS_QUOTE_CODE");
    await queryRunner.dropIndex("price_pairs", "IDX_PRICE_PAIRS_MARKET_TYPE");
    await queryRunner.dropIndex("price_pairs", "IDX_PRICE_PAIRS_IS_VALID");
    await queryRunner.dropTable("price_pairs");
  }
}
