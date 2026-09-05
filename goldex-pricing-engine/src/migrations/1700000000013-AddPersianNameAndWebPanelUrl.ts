import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPersianNameAndWebPanelUrl1700000000013 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('providers', [
      new TableColumn({
        name: 'persianName',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'webPanelUrl',
        type: 'text',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('providers', ['persianName', 'webPanelUrl']);
  }
}
