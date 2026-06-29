import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// Customer-facing gram volume + per-gram price on each provider deal.
export class AddProviderDealGram1700000000010 implements MigrationInterface {
  name = 'AddProviderDealGram1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('provider_deals');
    if (table && !table.findColumnByName('gramVolume')) {
      await queryRunner.addColumn(
        'provider_deals',
        new TableColumn({ name: 'gramVolume', type: 'decimal', precision: 20, scale: 8, isNullable: true })
      );
    }
    if (table && !table.findColumnByName('gramPrice')) {
      await queryRunner.addColumn(
        'provider_deals',
        new TableColumn({ name: 'gramPrice', type: 'decimal', precision: 20, scale: 8, isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('provider_deals');
    if (table && table.findColumnByName('gramPrice')) await queryRunner.dropColumn('provider_deals', 'gramPrice');
    if (table && table.findColumnByName('gramVolume')) await queryRunner.dropColumn('provider_deals', 'gramVolume');
  }
}
