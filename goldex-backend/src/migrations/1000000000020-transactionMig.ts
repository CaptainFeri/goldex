import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from "typeorm";

export class transactionMig1000000000020 implements MigrationInterface {
  name?: "transactionMig1000000000020";
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "transaction",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "wallet_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "transaction_id",
            type: "varchar",
            isUnique: true,
            isNullable: false,
          },
          {
            name: "transaction_type",
            type: "enum",
            enum: ["DEPOSIT", "WITHDRAWAL", "BUY", "SELL", "ADMIN_ADJUSTMENT", "FEE", "REFERRAL", "ORDER"],
            isNullable: false,
          },
          {
            name: "status",
            type: "enum",
            enum: ["pending", "processing", "completed", "failed", "cancelled", "refunded"],
            default: "'pending'",
          },
          {
            name: "amount",
            type: "decimal",
            precision: 20,
            scale: 8,
            isNullable: false,
          },
          {
            name: "fee",
            type: "decimal",
            precision: 20,
            scale: 8,
            default: 0,
          },
          {
            name: "price",
            type: "decimal",
            precision: 20,
            scale: 8,
            isNullable: true,
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "metadata",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "completed_at",
            type: "timestamp",
            isNullable: true,
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
      "transaction",
      new TableIndex({
        name: "IDX_TRANSACTION_WALLET",
        columnNames: ["wallet_id"],
      })
    );

    await queryRunner.createIndex(
      "transaction",
      new TableIndex({
        name: "IDX_TRANSACTION_STATUS",
        columnNames: ["status"],
      })
    );

    await queryRunner.createIndex(
      "transaction",
      new TableIndex({
        name: "IDX_TRANSACTION_CREATED_AT",
        columnNames: ["created_at"],
      })
    );

    await queryRunner.createIndex(
      "transaction",
      new TableIndex({
        name: "IDX_TRANSACTION_TYPE",
        columnNames: ["transaction_type"],
      })
    );

    await queryRunner.createForeignKey(
      "transaction",
      new TableForeignKey({
        columnNames: ["wallet_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "wallet",
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("transaction");
    const foreignKeys = table.foreignKeys;

    for (const fk of foreignKeys) {
      await queryRunner.dropForeignKey("transaction", fk);
    }

    await queryRunner.dropTable("transaction");
  }
}
