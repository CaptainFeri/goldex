import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// The order price expressed per mesghal on each provider deal.
export class AddProviderDealMesghalPrice1700000000011 implements MigrationInterface {
  name = 'AddProviderDealMesghalPrice1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('provider_deals');
    if (table && !table.findColumnByName('mesghalPrice')) {
      await queryRunner.addColumn(
        'provider_deals',
        new TableColumn({ name: 'mesghalPrice', type: 'decimal', precision: 20, scale: 8, isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('provider_deals');
    if (table && table.findColumnByName('mesghalPrice')) {
      await queryRunner.dropColumn('provider_deals', 'mesghalPrice');
    }
  }
}
