import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Marks vouchers the platform raises itself.
 *
 * Warehouse deposits, warehouse withdrawals and provider settlements each book
 * an entry at the moment the movement completes, and those are booked
 * FINALIZED: the gold is already in the vault and the wallet already credited,
 * so there is nothing left for a second operator to approve or refuse. Entries
 * an accountant files still go through the draft → pending → finalized review.
 *
 * A report that must exclude un-reviewed entries has to be able to tell the two
 * apart, and reading intent out of the description is not that. `source` says
 * who raised it and `reference_id` says what it was raised for.
 */
export class SystemVoucherMig1000000000108 implements MigrationInterface {
  name = "SystemVoucherMig1000000000108";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const vouchers = await queryRunner.getTable("accounting_vouchers");
    if (!vouchers) return;

    if (!vouchers.findColumnByName("source")) {
      await queryRunner.query(
        `ALTER TABLE "accounting_vouchers" ADD "source" varchar(40) NOT NULL DEFAULT 'manual'`
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_VOUCHER_SOURCE" ON "accounting_vouchers" ("source")`
      );
    }
    if (!vouchers.findColumnByName("reference_id")) {
      await queryRunner.query(`ALTER TABLE "accounting_vouchers" ADD "reference_id" uuid`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const vouchers = await queryRunner.getTable("accounting_vouchers");
    if (!vouchers) return;

    if (vouchers.findColumnByName("reference_id")) {
      await queryRunner.query(`ALTER TABLE "accounting_vouchers" DROP COLUMN "reference_id"`);
    }
    if (vouchers.findColumnByName("source")) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_VOUCHER_SOURCE"`);
      await queryRunner.query(`ALTER TABLE "accounting_vouchers" DROP COLUMN "source"`);
    }
  }
}
