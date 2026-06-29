import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddOtpUrlColumns1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('providers', [
      new TableColumn({
        name: 'sendOtpUrl',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'verifyCodeUrl',
        type: 'text',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('providers', ['sendOtpUrl', 'verifyCodeUrl']);
  }
}
