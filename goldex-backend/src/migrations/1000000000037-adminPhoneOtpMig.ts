import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

// Admins now authenticate by mobile + OTP. Adds a unique `phone` column and
// relaxes the previously-required email/hash_password to nullable.
export class AdminPhoneOtpMig1000000000037 implements MigrationInterface {
  name = "AdminPhoneOtpMig1000000000037";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("admin");
    if (!table) return;

    if (!table.findColumnByName("phone")) {
      await queryRunner.addColumn(
        "admin",
        new TableColumn({ name: "phone", type: "varchar", isNullable: true, isUnique: true })
      );
    }

    // Make email + hash_password nullable (OTP admins have neither).
    await queryRunner.query(`ALTER TABLE "admin" ALTER COLUMN "email" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "admin" ALTER COLUMN "hash_password" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("admin");
    if (table && table.findColumnByName("phone")) {
      await queryRunner.dropColumn("admin", "phone");
    }
    // NOTE: not re-adding NOT NULL on email/hash_password — OTP admins may have nulls.
  }
}
