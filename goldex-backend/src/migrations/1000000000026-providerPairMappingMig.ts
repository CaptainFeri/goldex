import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from "typeorm";

export class ProviderPairMappingMig1000000000026 implements MigrationInterface {
  name = "ProviderPairMappingMig1000000000026";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.createTable(
      new Table({
        name: "provider_pair_mappings",
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
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updated_at",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
            onUpdate: "CURRENT_TIMESTAMP",
          },
          {
            name: "deleted_at",
            type: "timestamptz",
            isNullable: true,
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
            name: "use_buy_price",
            type: "boolean",
            default: true,
          },
          {
            name: "use_sell_price",
            type: "boolean",
            default: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "provider_pair_mappings",
      new TableIndex({
        name: "IDX_PROVIDER_PAIR_MAPPINGS_UNIQUE",
        columnNames: ["pair_id", "provider_key", "provider_item_id"],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      "provider_pair_mappings",
      new TableForeignKey({
        name: "FK_PROVIDER_PAIR_MAPPINGS_PAIR",
        columnNames: ["pair_id"],
        referencedTableName: "price_pairs",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      }),
    );

    await queryRunner.createIndex(
      "provider_pair_mappings",
      new TableIndex({
        name: "IDX_PROVIDER_PAIR_MAPPINGS_PROVIDER",
        columnNames: ["provider_key", "provider_item_id"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("provider_pair_mappings");
    if (table) {
      const foreignKeys = table.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey("provider_pair_mappings", foreignKey);
      }
    }

    await queryRunner.dropIndex("provider_pair_mappings", "IDX_PROVIDER_PAIR_MAPPINGS_UNIQUE");
    await queryRunner.dropIndex("provider_pair_mappings", "IDX_PROVIDER_PAIR_MAPPINGS_PROVIDER");
    await queryRunner.dropTable("provider_pair_mappings");
  }
}
