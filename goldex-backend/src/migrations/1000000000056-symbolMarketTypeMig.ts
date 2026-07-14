import { MigrationInterface, QueryRunner } from "typeorm";

export class SymbolMarketTypeMig1000000000056 implements MigrationInterface {
  name = "SymbolMarketTypeMig1000000000056";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add 'rial' to symbol_type_enum
    await queryRunner.query(`ALTER TYPE "public"."symbol_symbol_type_enum" ADD VALUE IF NOT EXISTS 'rial'`);

    // 2. Add 'custom' to payment_gateway_enum
    await queryRunner.query(`ALTER TYPE "public"."symbol_payment_gateway_type_enum" ADD VALUE IF NOT EXISTS 'custom'`);

    // 3. Rename the existing market_type enum from price_pairs to symbol
    await queryRunner.query(`ALTER TYPE "public"."price_pairs_market_type_enum" RENAME TO "symbol_market_type_enum"`);

    // 4. Add market_type column to symbol table using the renamed enum type
    await queryRunner.query(
      `ALTER TABLE "symbol" ADD "market_type" "public"."symbol_market_type_enum" NOT NULL DEFAULT 'formal'`,
    );

    // 5. Drop market_type column from price_pairs table
    await queryRunner.query(`ALTER TABLE "price_pairs" DROP COLUMN "market_type"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 5. Re-add market_type column to price_pairs
    await queryRunner.query(
      `ALTER TABLE "price_pairs" ADD "market_type" "public"."symbol_market_type_enum" NOT NULL DEFAULT 'formal'`,
    );

    // 4. Drop market_type column from symbol table
    await queryRunner.query(`ALTER TABLE "symbol" DROP COLUMN "market_type"`);

    // 3. Rename the enum type back
    await queryRunner.query(`ALTER TYPE "public"."symbol_market_type_enum" RENAME TO "price_pairs_market_type_enum"`);

    // 2. Remove 'custom' from payment_gateway_enum
    await queryRunner.query(
      `DELETE FROM "pg_enum" WHERE "enumlabel" = 'custom' AND "enumtypid" = (SELECT oid FROM "pg_type" WHERE "typname" = 'symbol_payment_gateway_type_enum')`,
    );

    // 1. Remove 'rial' from symbol_type_enum
    await queryRunner.query(
      `DELETE FROM "pg_enum" WHERE "enumlabel" = 'rial' AND "enumtypid" = (SELECT oid FROM "pg_type" WHERE "typname" = 'symbol_symbol_type_enum')`,
    );
  }
}
