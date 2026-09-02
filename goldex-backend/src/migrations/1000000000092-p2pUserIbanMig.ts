import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Customers now name an IBAN on every p2p transfer — the destination on a
 * withdrawal, the source on a deposit — and it is stored against them.
 *
 * The account need not belong to the customer, so it is tagged P2P_WALLET
 * rather than being mistaken for the KYC-verified one. That means a user can
 * hold several accounts, so uniqueness moves from `user_id` alone to the
 * (user_id, iban) pair.
 */
export class P2pUserIbanMig1000000000092 implements MigrationInterface {
  name = "P2pUserIbanMig1000000000092";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_bank_account_tag_enum" AS ENUM ('KYC', 'P2P_WALLET');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "user_bank_account"
        ADD COLUMN IF NOT EXISTS "tag" "user_bank_account_tag_enum" NOT NULL DEFAULT 'KYC';
    `);

    // Drop whatever unique constraint or index currently pins one account per
    // user; the name varies with how the table was created.
    await queryRunner.query(`
      DO $$
      DECLARE con_name text;
      BEGIN
        FOR con_name IN
          SELECT c.conname
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
           WHERE t.relname = 'user_bank_account'
             AND c.contype = 'u'
             AND array_length(c.conkey, 1) = 1
             AND a.attname = 'user_id'
        LOOP
          EXECUTE format('ALTER TABLE "user_bank_account" DROP CONSTRAINT %I', con_name);
        END LOOP;

        FOR con_name IN
          SELECT i.relname
            FROM pg_index x
            JOIN pg_class i ON i.oid = x.indexrelid
            JOIN pg_class t ON t.oid = x.indrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (x.indkey)
           WHERE t.relname = 'user_bank_account'
             AND x.indisunique
             AND x.indnatts = 1
             AND a.attname = 'user_id'
        LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I', con_name);
        END LOOP;
      END $$;
    `);

    // Rows with a NULL iban are left out: Postgres treats NULLs as distinct,
    // and a partial index states the intent plainly.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_bank_account_user_iban"
        ON "user_bank_account" ("user_id", "iban")
        WHERE "iban" IS NOT NULL AND "deleted_at" IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "p2p_deposit_intent"
        ADD COLUMN IF NOT EXISTS "source_iban" varchar,
        ADD COLUMN IF NOT EXISTS "source_bank_account_id" uuid;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "p2p_deposit_intent"
        DROP COLUMN IF EXISTS "source_bank_account_id",
        DROP COLUMN IF EXISTS "source_iban";
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_bank_account_user_iban"`);
    await queryRunner.query(`ALTER TABLE "user_bank_account" DROP COLUMN IF EXISTS "tag"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_bank_account_tag_enum"`);
    // The original one-account-per-user constraint is deliberately not
    // recreated: rows added since would violate it.
  }
}
