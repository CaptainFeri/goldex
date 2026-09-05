import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from "typeorm";

export class UpdateWalletEntity1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "wallet",
      new TableColumn({
        name: "status",
        type: "varchar",
        length: "20",
        default: "'ACTIVE'",
        isNullable: false,
      })
    );

    await queryRunner.addColumn(
      "wallet",
      new TableColumn({
        name: "frozen_free_balance",
        type: "decimal",
        precision: 20,
        scale: 8,
        default: 0,
        isNullable: false,
      })
    );

    await queryRunner.addColumn(
      "wallet",
      new TableColumn({
        name: "frozen_locked_balance",
        type: "decimal",
        precision: 20,
        scale: 8,
        default: 0,
        isNullable: false,
      })
    );

    await queryRunner.addColumn(
      "wallet",
      new TableColumn({
        name: "frozen_at",
        type: "timestamp",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "wallet",
      new TableColumn({
        name: "admin_note",
        type: "text",
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("wallet", "admin_note");
    await queryRunner.dropColumn("wallet", "frozen_at");
    await queryRunner.dropColumn("wallet", "frozen_locked_balance");
    await queryRunner.dropColumn("wallet", "frozen_free_balance");
    await queryRunner.dropColumn("wallet", "status");
  }
}
