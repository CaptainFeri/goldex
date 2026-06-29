import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateProviderBalancesTable1700000000005 implements MigrationInterface {
  name = 'CreateProviderBalancesTable1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'provider_balances',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'providerKey', type: 'varchar' },
          { name: 'providerCategory', type: 'varchar' },
          { name: 'goldBalance', type: 'decimal', precision: 18, scale: 4, isNullable: true },
          { name: 'goldUnit', type: 'varchar', isNullable: true },
          { name: 'rialBalance', type: 'decimal', precision: 18, scale: 0, isNullable: true },
          { name: 'rialUnit', type: 'varchar', isNullable: true },
          { name: 'totalTaraz', type: 'decimal', precision: 18, scale: 0, isNullable: true },
          { name: 'snapshotDate', type: 'varchar', isNullable: true },
          { name: 'rawData', type: 'jsonb', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'provider_balances',
      new TableIndex({
        name: 'IDX_PROVIDER_BALANCES_KEY_DATE',
        columnNames: ['providerKey', 'snapshotDate'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'provider_balances',
      new TableIndex({
        name: 'IDX_PROVIDER_BALANCES_CATEGORY',
        columnNames: ['providerCategory'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('provider_balances');
  }
}
