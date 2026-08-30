import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddProviderColumns1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('providers', [
      new TableColumn({
        name: 'apiBaseUrl',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'phone',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'config',
        type: 'jsonb',
        default: "'{}'",
      }),
    ]);
    // Change active default to false
    await queryRunner.changeColumn(
      'providers',
      'active',
      new TableColumn({
        name: 'active',
        type: 'boolean',
        default: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('providers', ['apiBaseUrl', 'phone', 'config']);
    await queryRunner.changeColumn(
      'providers',
      'active',
      new TableColumn({
        name: 'active',
        type: 'boolean',
        default: true,
      }),
    );
  }
}
