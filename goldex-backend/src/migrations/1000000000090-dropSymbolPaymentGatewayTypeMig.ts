import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Drops `symbol.payment_gateway_type` and its now-orphaned enum type.
 *
 * It held a legacy gateway enum (up / mellat / pasargad / custom) that no
 * payment code path ever read: deposits and withdrawals resolve their provider
 * from `deposit_gateways` / `withdraw_gateways` (goldex-cbp registry codes) and
 * the `default_*_gateway` columns, and `payment-bus` never synced it to cbp.
 * Only the admin form wrote it.
 */
export class DropSymbolPaymentGatewayTypeMig1000000000090 implements MigrationInterface {
  name = "DropSymbolPaymentGatewayTypeMig1000000000090";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "symbol" DROP COLUMN IF EXISTS "payment_gateway_type"`);
    // Safe even if another column somehow still uses it: DROP TYPE without
    // CASCADE fails rather than taking that column with it.
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."symbol_payment_gateway_type_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'symbol_payment_gateway_type_enum') THEN
          CREATE TYPE "public"."symbol_payment_gateway_type_enum"
            AS ENUM ('up', 'mellat', 'pasargad', 'custom');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "symbol" ADD COLUMN IF NOT EXISTS "payment_gateway_type"
        "public"."symbol_payment_gateway_type_enum" DEFAULT 'up'
    `);
  }
}
