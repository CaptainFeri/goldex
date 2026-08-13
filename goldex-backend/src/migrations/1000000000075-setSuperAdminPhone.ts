import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Ensures the super admin has the seeded mobile number for OTP login. The
 * original seed migration only inserted by email, so admins created before this
 * change have a null phone.
 */
export class SetSuperAdminPhone1000000000075 implements MigrationInterface {
  name = "SetSuperAdminPhone1000000000075";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE admin
         SET phone = '09106299465'
       WHERE role = 'superAdmin'
         AND deleted_at IS NULL
         AND (phone IS NULL OR phone <> '09106299465')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op: we don't want to clear the seeded phone on rollback.
  }
}