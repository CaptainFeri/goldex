import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Makes voucher codes safe to allocate concurrently, and marks vouchers the
 * platform issues itself.
 *
 * `nextVoucherCode` derived the sequence from `COUNT(*) LIKE 'DOC-<month>%'`.
 * Two vouchers created in the same instant both read the same count, built the
 * same code, and the second lost to the unique index — tolerable while an
 * accountant typed them in one at a time, not once warehouse deposits,
 * warehouse withdrawals and provider settlements all issue vouchers of their
 * own. `accounting_voucher_counters` replaces the count with an atomic
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`, which hands each caller a
 * distinct value under concurrency.
 *
 * The counter is seeded from the highest sequence already used in each month,
 * not from the row count, so it stays correct in a database where a voucher
 * was deleted.
 *
 * `source` and `reference_id` keep a system-issued voucher distinguishable
 * from one an accountant booked by hand. These are booked FINALIZED, which
 * deliberately bypasses the two-operator control in `assertReviewable` — a
 * deposit cannot wait for a second signature before the depositor's wallet
 * reflects it — so a report has to be able to tell the two apart.
 */
export class SystemVoucherMig1000000000108 implements MigrationInterface {
  name = "SystemVoucherMig1000000000108";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "accounting_voucher_counters" (
        "prefix" varchar(20) NOT NULL,
        "last_value" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_ACCOUNTING_VOUCHER_COUNTERS" PRIMARY KEY ("prefix")
      )
    `);

    // Seed from the highest sequence per month prefix. `DOC-` + 4-digit Jalali
    // year + 2-digit month is 10 characters, so the sequence starts at 11.
    await queryRunner.query(`
      INSERT INTO "accounting_voucher_counters" ("prefix", "last_value")
      SELECT left("voucher_code", 10),
             MAX(CAST(substring("voucher_code" from 11) AS integer))
        FROM "accounting_vouchers"
       WHERE "voucher_code" ~ '^DOC-[0-9]{6}[0-9]+$'
       GROUP BY left("voucher_code", 10)
          ON CONFLICT ("prefix") DO NOTHING
    `);

    const vouchers = await queryRunner.getTable("accounting_vouchers");

    if (vouchers) {
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const vouchers = await queryRunner.getTable("accounting_vouchers");

    if (vouchers) {
      if (vouchers.findColumnByName("reference_id")) {
        await queryRunner.query(`ALTER TABLE "accounting_vouchers" DROP COLUMN "reference_id"`);
      }
      if (vouchers.findColumnByName("source")) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_VOUCHER_SOURCE"`);
        await queryRunner.query(`ALTER TABLE "accounting_vouchers" DROP COLUMN "source"`);
      }
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "accounting_voucher_counters"`);
  }
}
