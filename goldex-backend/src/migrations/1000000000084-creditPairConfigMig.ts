import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

/**
 * Adds credit abilities moved out of features plus per-pair credit configs:
 * credit_trading_enabled, credit_max_amount, credit_max_duration_days and the
 * credit_configs jsonb column on user_level.
 */
export class CreditPairConfigMig1000000000084 implements MigrationInterface {
  name = "CreditPairConfigMig1000000000084";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("user_level");
    if (!table) return;

    if (!table.findColumnByName("credit_trading_enabled")) {
      await queryRunner.addColumn(
        "user_level",
        new TableColumn({ name: "credit_trading_enabled", type: "boolean", isNullable: true, default: true }),
      );
    }
    if (!table.findColumnByName("credit_max_amount")) {
      await queryRunner.addColumn(
        "user_level",
        new TableColumn({ name: "credit_max_amount", type: "decimal", precision: 20, scale: 8, isNullable: true }),
      );
    }
    if (!table.findColumnByName("credit_max_duration_days")) {
      await queryRunner.addColumn(
        "user_level",
        new TableColumn({ name: "credit_max_duration_days", type: "int", isNullable: true }),
      );
    }
    if (!table.findColumnByName("credit_configs")) {
      await queryRunner.addColumn(
        "user_level",
        new TableColumn({ name: "credit_configs", type: "jsonb", isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("user_level");
    if (!table) return;
    for (const col of ["credit_configs", "credit_max_duration_days", "credit_max_amount", "credit_trading_enabled"]) {
      if (table.findColumnByName(col)) {
        await queryRunner.dropColumn("user_level", col);
      }
    }
  }
}