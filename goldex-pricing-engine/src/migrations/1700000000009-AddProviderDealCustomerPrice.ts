import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// The price the customer trades at (with our markup), alongside the pure/real
// price we place with the provider (inputPrice).
export class AddProviderDealCustomerPrice1700000000009 implements MigrationInterface {
  name = 'AddProviderDealCustomerPrice1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('provider_deals');
    if (table && !table.findColumnByName('customerPrice')) {
      await queryRunner.addColumn(
        'provider_deals',
        new TableColumn({ name: 'customerPrice', type: 'decimal', precision: 20, scale: 8, isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('provider_deals');
    if (table && table.findColumnByName('customerPrice')) {
      await queryRunner.dropColumn('provider_deals', 'customerPrice');
    }
  }
}
