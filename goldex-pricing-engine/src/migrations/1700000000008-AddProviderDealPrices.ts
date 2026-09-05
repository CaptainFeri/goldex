import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// Records the requested (input) price and the actual fill price on each deal.
export class AddProviderDealPrices1700000000008 implements MigrationInterface {
  name = 'AddProviderDealPrices1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('provider_deals', [
      new TableColumn({ name: 'inputPrice', type: 'decimal', precision: 20, scale: 8, isNullable: true }),
      new TableColumn({ name: 'filledPrice', type: 'decimal', precision: 20, scale: 8, isNullable: true }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('provider_deals', ['inputPrice', 'filledPrice']);
  }
}
