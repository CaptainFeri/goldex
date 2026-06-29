import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class SystemLedgerMig1000000000033 implements MigrationInterface {
  name = "SystemLedgerMig1000000000033";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "system_ledger",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "gen_random_uuid()",
          },
          { name: "symbol_id", type: "uuid" },
          {
            name: "type",
            type: "enum",
            enum: ["COMMISSION_BUY", "COMMISSION_SELL", "ADJUSTMENT"],
          },
          { name: "amount", type: "decimal", precision: 20, scale: 8 },
          { name: "order_id", type: "uuid", isNullable: true },
          { name: "user_id", type: "uuid", isNullable: true },
          { name: "description", type: "varchar", isNullable: true },
          { name: "created_at", type: "timestamptz", default: "now()" },
        ],
        foreignKeys: [
          {
            columnNames: ["symbol_id"],
            referencedTableName: "symbol",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      "system_ledger",
      new TableIndex({ name: "IDX_system_ledger_symbol_created", columnNames: ["symbol_id", "created_at"] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("system_ledger");
  }
}
