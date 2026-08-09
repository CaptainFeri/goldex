import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the shahin module tables (shahin_accounts, shahin_entries).
 * The shahin module was added without a migration and the backend runs
 * with synchronize:false, so the tables must be created explicitly.
 */
export class ShahinMig1000000000070 implements MigrationInterface {
  name = "ShahinMig1000000000070";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shahin_accounts" (
        "id" SERIAL NOT NULL,
        "userId" uuid,
        "accountNumber" character varying(50) NOT NULL,
        "iban" character varying(50),
        "ownerName" character varying(100),
        "bankName" character varying(100),
        "bankCode" character varying(10) NOT NULL,
        "nationalCode" character varying(20),
        "balance" numeric(18,2),
        "accountStatus" character varying(20) NOT NULL DEFAULT 'active',
        "accountType" character varying(20),
        "lastAccessedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "metadata" json,
        CONSTRAINT "PK_shahin_accounts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_shahin_accounts_accountNumber_bankCode"
      ON "shahin_accounts" ("accountNumber", "bankCode")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shahin_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid,
        "accountId" integer,
        "type" character varying(50) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "endpoint" character varying(200) NOT NULL,
        "method" character varying(10) NOT NULL,
        "statusCode" integer,
        "requestData" json,
        "responseData" json,
        "errorMessage" text,
        "errorCode" character varying(50),
        "transactionId" character varying(100),
        "transactionUuid" character varying(100),
        "amount" numeric(18,2),
        "currency" character varying(10),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "metadata" json,
        CONSTRAINT "PK_shahin_entries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shahin_entries_userId_createdAt"
      ON "shahin_entries" ("userId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shahin_entries_accountId_createdAt"
      ON "shahin_entries" ("accountId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shahin_entries_type_status"
      ON "shahin_entries" ("type", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shahin_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shahin_accounts"`);
  }
}