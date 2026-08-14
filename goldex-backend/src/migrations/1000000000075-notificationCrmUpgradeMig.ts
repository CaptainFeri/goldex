import { MigrationInterface, QueryRunner } from "typeorm";

export class NotificationCrmUpgradeMig1000000000075 implements MigrationInterface {
  name = "NotificationCrmUpgradeMig1000000000075";
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add SUPPORT category used for ticket/support notifications.
    await queryRunner.query(
      `ALTER TYPE "public"."notification_category_enum" ADD VALUE IF NOT EXISTS 'SUPPORT'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing an enum value.
    // Reverting requires recreating the type; documented but not executed here.
    return;
  }
}
