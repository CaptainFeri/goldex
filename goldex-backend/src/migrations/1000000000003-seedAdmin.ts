import { MigrationInterface, QueryRunner } from "typeorm";
import * as bcrypt from "bcryptjs";
import { AdminRole } from "../admin/role/admin.roles.enum";

/** Seeded mobile number for the super admin (OTP login identity). */
const SEED_PHONE = "09106299465";

export class seedAdmin1000000000003 implements MigrationInterface {
  name?: "seedAdmin1000000000003";
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'admin'
      );
    `);

    if (!tableExists[0].exists) {
      console.log("Admin table does not exist yet. Skipping seed.");
      return;
    }

    const username = process.env.GOLDEX_AUTH_SUPER_ADMIN_USERNAME;
    const password = process.env.GOLDEX_AUTH_SUPER_ADMIN_PASSWORD;

    if (!username || !password) {
      throw new Error("Admin username or password is not set in environment variables.");
    }

    // Check if admin already exists
    const existingAdmin = await queryRunner.query(`SELECT * FROM admin WHERE email = $1 AND deleted_at IS NULL`, [
      username,
    ]);

    if (existingAdmin.length > 0) {
      // Ensure the super admin also has the seeded mobile number so OTP login works.
      await queryRunner.query(
        `UPDATE admin SET phone = $1 WHERE email = $2 AND deleted_at IS NULL AND (phone IS NULL OR phone <> $1)`,
        [SEED_PHONE, username],
      );
      console.log("Admin already exists. Skipping insertion.");
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert admin with all new fields
    await queryRunner.query(
      `INSERT INTO admin (
        email,
        phone,
        hash_password,
        role,
        is_suspended,
        suspended_at,
        suspended_by,
        last_login_at,
        created_at,
        updated_at,
        deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)`,
      [username, SEED_PHONE, hashedPassword, AdminRole.SUPER_ADMIN, false, null, null, null, null]
    );

    console.log(`Super admin ${username} created successfully`);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    const username = process.env.GOLDEX_AUTH_SUPER_ADMIN_USERNAME;

    if (!username) {
      throw new Error("Admin username is not set in environment variables.");
    }

    // Check if table exists before attempting to soft delete
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'admin'
      );
    `);

    if (tableExists[0].exists) {
      await queryRunner.query(`UPDATE admin SET deleted_at = NOW() WHERE email = $1 AND deleted_at IS NULL`, [
        username,
      ]);
      console.log(`Super admin ${username} soft deleted successfully`);
    }
  }
}
