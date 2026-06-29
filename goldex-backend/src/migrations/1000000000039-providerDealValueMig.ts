import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

// Adds per-side cash columns so the dashboard can show a provider's net IRR
// position (sell value − buy value) alongside its net XAU volume.
export class ProviderDealValueMig1000000000039 implements MigrationInterface {
  name = "ProviderDealValueMig1000000000039";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("provider_deal_snapshots");
    if (!table) return;
    const cols = [
      new TableColumn({ name: "buy_value", type: "decimal", precision: 24, scale: 2, default: 0 }),
      new TableColumn({ name: "sell_value", type: "decimal", precision: 24, scale: 2, default: 0 }),
      new TableColumn({ name: "net_value", type: "decimal", precision: 24, scale: 2, default: 0 }),
    ];
    for (const c of cols) {
      if (!table.findColumnByName(c.name)) await queryRunner.addColumn("provider_deal_snapshots", c);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ["buy_value", "sell_value", "net_value"]) {
      const table = await queryRunner.getTable("provider_deal_snapshots");
      if (table?.findColumnByName(name)) await queryRunner.dropColumn("provider_deal_snapshots", name);
    }
  }
}
