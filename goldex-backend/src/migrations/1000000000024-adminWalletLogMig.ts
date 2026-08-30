import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from "typeorm";

export class UpdateWalletMig1000000000024 implements MigrationInterface {
  name?: "UpdateWalletMig1000000000024";
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "admin_wallet_logs",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          { name: "admin_id", type: "uuid", isNullable: false },
          { name: "wallet_id", type: "uuid", isNullable: false },
          { name: "action", type: "varchar", length: "50", isNullable: false },
          { name: "metadata", type: "jsonb", isNullable: true },
          { name: "created_at", type: "timestamp", default: "CURRENT_TIMESTAMP" },
          { name: "updated_at", type: "timestamp", default: "CURRENT_TIMESTAMP", onUpdate: "CURRENT_TIMESTAMP" },
          { name: "deleted_at", type: "timestamp", isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      "admin_wallet_logs",
      new TableIndex({
        name: "IDX_ADMIN_LOG_WALLET_ID",
        columnNames: ["wallet_id"],
      })
    );

    await queryRunner.createIndex(
      "admin_wallet_logs",
      new TableIndex({
        name: "IDX_ADMIN_LOG_ADMIN_ID",
        columnNames: ["admin_id"],
      })
    );

    await queryRunner.createIndex(
      "admin_wallet_logs",
      new TableIndex({
        name: "IDX_ADMIN_LOG_ACTION",
        columnNames: ["action"],
      })
    );

    await queryRunner.createForeignKey(
      "admin_wallet_logs",
      new TableForeignKey({
        columnNames: ["wallet_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "wallet",
        onDelete: "CASCADE",
        name: "FK_ADMIN_LOG_WALLET",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey("admin_wallet_logs", "FK_ADMIN_LOG_WALLET");
    await queryRunner.dropIndex("admin_wallet_logs", "IDX_ADMIN_LOG_ACTION");
    await queryRunner.dropIndex("admin_wallet_logs", "IDX_ADMIN_LOG_ADMIN_ID");
    await queryRunner.dropIndex("admin_wallet_logs", "IDX_ADMIN_LOG_WALLET_ID");
    await queryRunner.dropTable("admin_wallet_logs");
  }
}
