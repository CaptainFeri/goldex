import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// Customer-shown price per gram (the per-mesghal one is `customerPrice`).
export class AddProviderDealCustomerGramPrice1700000000012 implements MigrationInterface {
  name = 'AddProviderDealCustomerGramPrice1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('provider_deals');
    if (table && !table.findColumnByName('customerGramPrice')) {
      await queryRunner.addColumn(
        'provider_deals',
        new TableColumn({ name: 'customerGramPrice', type: 'decimal', precision: 20, scale: 8, isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('provider_deals');
    if (table && table.findColumnByName('customerGramPrice')) {
      await queryRunner.dropColumn('provider_deals', 'customerGramPrice');
    }
  }
}
