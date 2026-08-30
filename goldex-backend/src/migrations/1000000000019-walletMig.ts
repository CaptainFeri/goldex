import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from "typeorm";

export class walletMig1000000000019 implements MigrationInterface {
  name?: "walletMig1000000000019";
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "wallet",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "user_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "symbol_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "free_balance",
            type: "decimal",
            precision: 20,
            scale: 8,
            default: 0,
          },
          {
            name: "locked_balance",
            type: "decimal",
            precision: 20,
            scale: 8,
            default: 0,
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
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      "wallet",
      new TableIndex({
        name: "IDX_WALLET_USER_PAIR",
        columnNames: ["user_id", "symbol_id"],
        isUnique: true,
      })
    );

    await queryRunner.createForeignKey(
      "wallet",
      new TableForeignKey({
        columnNames: ["user_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "user",
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createForeignKey(
      "wallet",
      new TableForeignKey({
        columnNames: ["symbol_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "symbol",
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("wallet");
    const foreignKeys = table.foreignKeys;

    for (const fk of foreignKeys) {
      await queryRunner.dropForeignKey("wallet", fk);
    }

    await queryRunner.dropTable("wallet");
  }
}
