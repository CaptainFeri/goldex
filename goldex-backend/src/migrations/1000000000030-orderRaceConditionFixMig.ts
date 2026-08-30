import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class OrderRaceConditionFixMig1000000000030 implements MigrationInterface {
  name?: "OrderRaceConditionFixMig1000000000030";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "order",
      new TableColumn({
        name: "provider_order_id",
        type: "varchar",
        length: "255",
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      "order",
      new TableColumn({
        name: "version",
        type: "integer",
        default: 1,
        isNullable: false,
      }),
    );

    await queryRunner.query(`
      CREATE INDEX "IDX_ORDER_PROVIDER_ORDER_ID" ON "order" ("provider_order_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ORDER_PROVIDER_ORDER_ID"`);
    await queryRunner.dropColumn("order", "version");
    await queryRunner.dropColumn("order", "provider_order_id");
  }
}
