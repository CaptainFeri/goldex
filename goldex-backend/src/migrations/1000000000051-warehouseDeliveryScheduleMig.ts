import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class WarehouseDeliveryScheduleMig1000000000051 implements MigrationInterface {
  name = "WarehouseDeliveryScheduleMig1000000000051";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "warehouse",
      new TableColumn({
        name: "delivery_schedule",
        type: "jsonb",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("warehouse", "delivery_schedule");
  }
}
