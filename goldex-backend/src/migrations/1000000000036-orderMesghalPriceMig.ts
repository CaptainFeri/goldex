import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

// Stores the order's price expressed per mesghal (alongside the per-gram price).
export class OrderMesghalPriceMig1000000000036 implements MigrationInterface {
  name = "OrderMesghalPriceMig1000000000036";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("order");
    if (table && !table.findColumnByName("mesghal_price")) {
      await queryRunner.addColumn(
        "order",
        new TableColumn({ name: "mesghal_price", type: "decimal", precision: 20, scale: 8, isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("order");
    if (table && table.findColumnByName("mesghal_price")) {
      await queryRunner.dropColumn("order", "mesghal_price");
    }
  }
}
