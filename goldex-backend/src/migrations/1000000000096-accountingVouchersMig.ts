import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Manual accounting entries.
 *
 * Separate from `system_ledger`, which the platform writes itself when an order
 * executes. This table is what an accountant books by hand, so it records who
 * entered it and who approved it — a ledger row needs neither.
 *
 * `side` is a stored column rather than a view over `movement` because a booked
 * voucher must keep reading the way it was booked even if the derivation rule
 * is ever revised.
 */
export class AccountingVouchersMig1000000000096 implements MigrationInterface {
  name = "AccountingVouchersMig1000000000096";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const types: [string, string[]][] = [
      ["voucher_movement_enum", ["deposit", "withdraw"]],
      ["voucher_side_enum", ["debtor", "creditor"]],
      ["voucher_status_enum", ["draft", "pending", "finalized", "rejected"]],
      ["voucher_customer_type_enum", ["formal", "informal"]],
      [
        "voucher_category_enum",
        ["fee", "customer_settlement", "account_correction", "deposit_entry", "withdraw_entry", "operating_cost"],
      ],
      ["voucher_wallet_subset_enum", ["cash", "credit", "frozen"]],
    ];
    for (const [name, values] of types) {
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE "${name}" AS ENUM (${values.map((v) => `'${v}'`).join(", ")});
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "accounting_vouchers" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now(),
        "deleted_at"        timestamptz,
        "voucher_code"      varchar(40) NOT NULL UNIQUE,
        "customer_id"       uuid,
        "customer_name"     varchar(200) NOT NULL,
        "customer_type"     "voucher_customer_type_enum" NOT NULL,
        "category"          "voucher_category_enum" NOT NULL,
        "movement"          "voucher_movement_enum" NOT NULL,
        "side"              "voucher_side_enum" NOT NULL,
        "symbol_id"         uuid NOT NULL,
        "amount"            numeric(20,8) NOT NULL,
        "wallet_type"       varchar(40) NOT NULL,
        "wallet_subset"     "voucher_wallet_subset_enum" NOT NULL,
        "description"       varchar(500) NOT NULL,
        "extra_description" varchar(500),
        "document_date"     timestamptz NOT NULL,
        "status"            "voucher_status_enum" NOT NULL DEFAULT 'draft',
        "created_by"        uuid NOT NULL,
        "reviewed_by"       uuid,
        "reviewed_at"       timestamptz,
        "review_note"       varchar(500),
        -- A voucher records a movement of a positive quantity; direction is
        -- carried by movement/side, so a negative amount is a data error.
        CONSTRAINT "chk_voucher_amount_positive" CHECK ("amount" > 0)
      )
    `);

    // The list is "newest first, optionally by status"; the queue is "pending".
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_vouchers_status_created" ON "accounting_vouchers" ("status", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_vouchers_customer" ON "accounting_vouchers" ("customer_id")`,
    );
    // Filters by accounting date, which is not the row's creation time.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_vouchers_document_date" ON "accounting_vouchers" ("document_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "accounting_vouchers"`);
    for (const name of [
      "voucher_wallet_subset_enum",
      "voucher_category_enum",
      "voucher_customer_type_enum",
      "voucher_status_enum",
      "voucher_side_enum",
      "voucher_movement_enum",
    ]) {
      await queryRunner.query(`DROP TYPE IF EXISTS "${name}"`);
    }
  }
}
