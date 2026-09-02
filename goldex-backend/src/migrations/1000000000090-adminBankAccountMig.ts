import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Company bank accounts, created and managed by an admin.
 *
 * Nothing in the schema described a company account before: `user_bank_account`
 * is per-customer and `shahin_accounts` is provider-sourced customer data. p2p
 * admin settlement is the first consumer; the manual deposit flow can adopt the
 * same table later as the destination it currently never shows the user.
 *
 * Direction is two independent booleans so one account can serve deposits,
 * withdrawals, both, or neither — each with its own limits.
 */
export class AdminBankAccountMig1000000000090 implements MigrationInterface {
  name = "AdminBankAccountMig1000000000090";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "admin_bank_account_status_enum" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_bank_account" (
        "id"                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"             timestamptz DEFAULT now(),
        "updated_at"             timestamptz DEFAULT now(),
        "deleted_at"             timestamptz,
        "title"                  varchar NOT NULL,
        "bank_name"              varchar NOT NULL,
        "owner_name"             varchar NOT NULL,
        "account_number"         varchar,
        "card_number"            varchar,
        "iban"                   varchar UNIQUE,
        "symbol_id"              uuid NOT NULL REFERENCES "symbol"("id") ON DELETE RESTRICT,
        "use_for_deposit"        boolean NOT NULL DEFAULT false,
        "use_for_withdraw"       boolean NOT NULL DEFAULT false,
        "priority"               integer NOT NULL DEFAULT 0,
        "deposit_daily_limit"    numeric(20,8),
        "deposit_per_tx_limit"   numeric(20,8),
        "withdraw_daily_limit"   numeric(20,8),
        "withdraw_per_tx_limit"  numeric(20,8),
        "deposit_used_today"     numeric(20,8) NOT NULL DEFAULT 0,
        "withdraw_used_today"    numeric(20,8) NOT NULL DEFAULT 0,
        "used_today_date"        date,
        "active_from_hour"       smallint,
        "active_to_hour"         smallint,
        "status"                 "admin_bank_account_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "notes"                  text,
        CONSTRAINT "admin_bank_account_identifier_check"
          CHECK ("iban" IS NOT NULL OR "account_number" IS NOT NULL OR "card_number" IS NOT NULL)
      );
    `);

    // One partial index per direction — the selection queries filter on the
    // flag and order by priority.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_bank_account_deposit"
        ON "admin_bank_account" ("priority")
        WHERE "use_for_deposit" = true AND "status" = 'ACTIVE' AND "deleted_at" IS NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_bank_account_withdraw"
        ON "admin_bank_account" ("priority")
        WHERE "use_for_withdraw" = true AND "status" = 'ACTIVE' AND "deleted_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_admin_bank_account_withdraw"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_admin_bank_account_deposit"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_bank_account"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "admin_bank_account_status_enum"`);
  }
}
