import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Manager trading accounts: the capital an admin may put behind their
 * arbitrage bots.
 *
 * Value enters or leaves an account only through a funding request a senior
 * admin approved, and an allocation to a bot freezes value rather than
 * spending it — `allocated_balance` is still the manager's, but it is the
 * bot's risk budget until released. Every change is written to the ledger so a
 * balance can always be explained.
 */
export class ManagerAccountMig1000000000095 implements MigrationInterface {
  name = "ManagerAccountMig1000000000095";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "manager_account" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "admin_id" uuid NOT NULL,
        "symbol_id" uuid NOT NULL,
        "available_balance" numeric(20,8) NOT NULL DEFAULT 0,
        "allocated_balance" numeric(20,8) NOT NULL DEFAULT 0,
        "status" character varying(20) NOT NULL DEFAULT 'ACTIVE',
        "note" text,
        CONSTRAINT "PK_manager_account" PRIMARY KEY ("id"),
        CONSTRAINT "FK_manager_account_admin" FOREIGN KEY ("admin_id")
          REFERENCES "admin"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_manager_account_symbol" FOREIGN KEY ("symbol_id")
          REFERENCES "symbol"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_manager_account_admin_symbol"
        ON "manager_account" ("admin_id", "symbol_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "manager_account_funding" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "account_id" uuid NOT NULL,
        "admin_id" uuid NOT NULL,
        "symbol_id" uuid NOT NULL,
        "amount" numeric(20,8) NOT NULL,
        "direction" character varying(10) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'PENDING',
        "requested_by_admin_id" uuid NOT NULL,
        "reviewed_by_admin_id" uuid,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "reason" text,
        "review_note" text,
        CONSTRAINT "PK_manager_account_funding" PRIMARY KEY ("id"),
        CONSTRAINT "FK_manager_funding_account" FOREIGN KEY ("account_id")
          REFERENCES "manager_account"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_manager_funding_account_status"
        ON "manager_account_funding" ("account_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "manager_account_ledger" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "account_id" uuid NOT NULL,
        "type" character varying(30) NOT NULL,
        "available_delta" numeric(20,8) NOT NULL DEFAULT 0,
        "allocated_delta" numeric(20,8) NOT NULL DEFAULT 0,
        "available_after" numeric(20,8) NOT NULL,
        "allocated_after" numeric(20,8) NOT NULL,
        "bot_id" uuid,
        "funding_id" uuid,
        "actor_admin_id" uuid,
        "description" text,
        CONSTRAINT "PK_manager_account_ledger" PRIMARY KEY ("id"),
        CONSTRAINT "FK_manager_ledger_account" FOREIGN KEY ("account_id")
          REFERENCES "manager_account"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_manager_ledger_account_created"
        ON "manager_account_ledger" ("account_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "manager_account_ledger"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "manager_account_funding"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "manager_account"`);
  }
}
