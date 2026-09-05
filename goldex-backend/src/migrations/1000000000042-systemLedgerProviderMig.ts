import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

// Attribute system-ledger profit to the provider that filled the order.
export class SystemLedgerProviderMig1000000000042 implements MigrationInterface {
  name = "SystemLedgerProviderMig1000000000042";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("system_ledger");
    if (table && !table.findColumnByName("provider_key")) {
      await queryRunner.addColumn(
        "system_ledger",
        new TableColumn({ name: "provider_key", type: "varchar", isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("system_ledger");
    if (table && table.findColumnByName("provider_key")) {
      await queryRunner.dropColumn("system_ledger", "provider_key");
    }
  }
}
