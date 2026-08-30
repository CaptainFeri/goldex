import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from "typeorm";

export class PricePairBestPriceMig1000000000027 implements MigrationInterface {
  name = "PricePairBestPriceMig1000000000027";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Add best price columns to price_pairs
    await queryRunner.addColumns("price_pairs", [
      new TableColumn({
        name: "best_buy_price",
        type: "decimal",
        precision: 20,
        scale: 8,
        isNullable: true,
      }),
      new TableColumn({
        name: "best_sell_price",
        type: "decimal",
        precision: 20,
        scale: 8,
        isNullable: true,
      }),
      new TableColumn({
        name: "best_buy_provider",
        type: "varchar",
        length: "50",
        isNullable: true,
      }),
      new TableColumn({
        name: "best_sell_provider",
        type: "varchar",
        length: "50",
        isNullable: true,
      }),
    ]);

    // Create price_pair_histories table
    await queryRunner.createTable(
      new Table({
        name: "price_pair_histories",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "pair_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "provider_key",
            type: "varchar",
            length: "50",
            isNullable: false,
          },
          {
            name: "provider_item_id",
            type: "int",
            isNullable: false,
          },
          {
            name: "buy_price",
            type: "decimal",
            precision: 20,
            scale: 8,
            isNullable: false,
          },
          {
            name: "sell_price",
            type: "decimal",
            precision: 20,
            scale: 8,
            isNullable: false,
          },
          {
            name: "created_at",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    // Index on pair_id + provider for fast lookups
    await queryRunner.createIndex(
      "price_pair_histories",
      new TableIndex({
        name: "IDX_PRICE_PAIR_HISTORIES_LOOKUP",
        columnNames: ["pair_id", "provider_key", "provider_item_id"],
      }),
    );

    // Foreign key to price_pairs
    await queryRunner.createForeignKey(
      "price_pair_histories",
      new TableForeignKey({
        name: "FK_PRICE_PAIR_HISTORIES_PAIR",
        columnNames: ["pair_id"],
        referencedTableName: "price_pairs",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("price_pair_histories");
    if (table) {
      const foreignKeys = table.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey("price_pair_histories", foreignKey);
      }
    }

    await queryRunner.dropIndex("price_pair_histories", "IDX_PRICE_PAIR_HISTORIES_LOOKUP");
    await queryRunner.dropTable("price_pair_histories");

    await queryRunner.dropColumns("price_pairs", [
      "best_buy_price",
      "best_sell_price",
      "best_buy_provider",
      "best_sell_provider",
    ]);
  }
}
