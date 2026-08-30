import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class WarehouseRequestSymbolMig1000000000049 implements MigrationInterface {
  name = "WarehouseRequestSymbolMig1000000000049";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "warehouse_request",
      new TableColumn({
        name: "symbol_id",
        type: "uuid",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("warehouse_request", "symbol_id");
  }
}
