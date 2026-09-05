import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

// Stores the customer-shown per-gram price so settlement can charge the display
// price (capturing the spread profit) instead of the pure provider price.
export class OrderCustomerPriceMig1000000000041 implements MigrationInterface {
  name = "OrderCustomerPriceMig1000000000041";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("order");
    if (table && !table.findColumnByName("customer_price")) {
      await queryRunner.addColumn(
        "order",
        new TableColumn({ name: "customer_price", type: "decimal", precision: 20, scale: 8, isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("order");
    if (table && table.findColumnByName("customer_price")) {
      await queryRunner.dropColumn("order", "customer_price");
    }
  }
}
