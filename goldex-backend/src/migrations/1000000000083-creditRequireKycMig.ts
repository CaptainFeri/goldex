import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

/**
 * Adds credit_require_kyc to user_level: per-level toggle controlling whether
 * KYC approval is required to open a self-service credit facility.
 */
export class CreditRequireKycMig1000000000083 implements MigrationInterface {
  name = "CreditRequireKycMig1000000000083";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("user_level");
    if (table && !table.findColumnByName("credit_require_kyc")) {
      await queryRunner.addColumn(
        "user_level",
        new TableColumn({
          name: "credit_require_kyc",
          type: "boolean",
          isNullable: true,
          default: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("user_level");
    if (table && table.findColumnByName("credit_require_kyc")) {
      await queryRunner.dropColumn("user_level", "credit_require_kyc");
    }
  }
}
