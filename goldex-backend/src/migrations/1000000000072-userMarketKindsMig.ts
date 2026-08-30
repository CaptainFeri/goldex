import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from "typeorm";

export class UserMarketKindsMig1000000000072 implements MigrationInterface {
  name = "UserMarketKindsMig1000000000072";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "user_market_kinds",
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
            name: "user_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "market_kind",
            type: "enum",
            enum: ["MARKET", "LIMIT", "OFFER"],
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      "user_market_kinds",
      new TableForeignKey({
        columnNames: ["user_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "user",
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createIndex(
      "user_market_kinds",
      new TableIndex({
        columnNames: ["user_id", "market_kind"],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("user_market_kinds");
    if (table) {
      const foreignKey = table.foreignKeys.find((fk) => fk.columnNames.indexOf("user_id") !== -1);
      if (foreignKey) await queryRunner.dropForeignKey("user_market_kinds", foreignKey);

      const uniqueIndex = table.indices.find(
        (idx) => idx.columnNames.indexOf("user_id") !== -1 && idx.columnNames.indexOf("market_kind") !== -1,
      );
      if (uniqueIndex) await queryRunner.dropIndex("user_market_kinds", uniqueIndex.name);

      await queryRunner.dropTable("user_market_kinds");
    }
  }
}
