import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateProvidersTable1700000000000 implements MigrationInterface {
  name = 'CreateProvidersTable1700000000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'providers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'key', type: 'varchar', isUnique: true },
          { name: 'category', type: 'varchar' },
          { name: 'baseUrl', type: 'text' },
          { name: 'auth', type: 'jsonb', default: "'{}'" },
          { name: 'active', type: 'boolean', default: true },
          { name: 'metadataRefreshIntervalMs', type: 'int', default: 60000 },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('providers');
  }
}
