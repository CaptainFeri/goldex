import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateProviderDealsTable1700000000004 implements MigrationInterface {
  name = 'CreateProviderDealsTable1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'provider_deals',
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
          { name: 'orderId', type: 'varchar', isNullable: true },
          { name: 'orderCode', type: 'varchar', isNullable: true },
          { name: 'factorCode', type: 'int', isNullable: true },
          { name: 'itemName', type: 'varchar', isNullable: true },
          { name: 'itemId', type: 'int', isNullable: true },
          { name: 'count', type: 'decimal', precision: 18, scale: 4, isNullable: true },
          { name: 'totalPrice', type: 'decimal', precision: 18, scale: 0, isNullable: true },
          { name: 'dealType', type: 'int', isNullable: true },
          { name: 'dealTypeStr', type: 'varchar', isNullable: true },
          { name: 'dealStatus', type: 'int', isNullable: true },
          { name: 'orderStatusStr', type: 'varchar', isNullable: true },
          { name: 'mazane', type: 'decimal', precision: 18, scale: 0, isNullable: true },
          { name: 'mazaneStr', type: 'varchar', isNullable: true },
          { name: 'orderDate', type: 'timestamp', isNullable: true },
          { name: 'orderDateStr', type: 'varchar', isNullable: true },
          { name: 'carat', type: 'int', isNullable: true },
          { name: 'weight750', type: 'decimal', precision: 18, scale: 4, isNullable: true },
          { name: 'rawData', type: 'jsonb', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'provider_deals',
      new TableIndex({
        name: 'IDX_PROVIDER_DEALS_KEY_ORDERID',
        columnNames: ['providerKey', 'orderId'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'provider_deals',
      new TableIndex({
        name: 'IDX_PROVIDER_DEALS_KEY_DATE',
        columnNames: ['providerKey', 'orderDate'],
      }),
    );

    await queryRunner.createIndex(
      'provider_deals',
      new TableIndex({
        name: 'IDX_PROVIDER_DEALS_CATEGORY',
        columnNames: ['providerCategory'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('provider_deals');
  }
}
