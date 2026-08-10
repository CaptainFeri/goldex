import { MigrationInterface, QueryRunner } from "typeorm";

// Make provider deal snapshots per (provider, item) with real pair symbols so
// the provider-finance balances can attribute deals to the actual base/quote
// pair instead of hardcoding XAU/IRR.
export class ProviderDealPairSymbolsMig1000000000071 implements MigrationInterface {
  name = "ProviderDealPairSymbolsMig1000000000071";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old unique constraint on provider_key (auto-generated name).
    await queryRunner.query(`
      DO $$
      DECLARE c TEXT;
      BEGIN
        SELECT conname INTO c
        FROM pg_constraint
        WHERE conrelid = 'provider_deal_snapshots'::regclass AND contype = 'u'
        LIMIT 1;
        IF c IS NOT NULL THEN
          EXECUTE 'ALTER TABLE provider_deal_snapshots DROP CONSTRAINT ' || quote_ident(c);
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "provider_deal_snapshots" ADD COLUMN "item_id" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "provider_deal_snapshots" ADD COLUMN "base_symbol" varchar(20)`
    );
    await queryRunner.query(
      `ALTER TABLE "provider_deal_snapshots" ADD COLUMN "quote_symbol" varchar(20)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_provider_deal_snapshots_provider_item"
         ON "provider_deal_snapshots" ("provider_key", "item_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_provider_deal_snapshots_provider_item"`
    );
    await queryRunner.query(
      `ALTER TABLE "provider_deal_snapshots" DROP COLUMN IF EXISTS "item_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "provider_deal_snapshots" DROP COLUMN IF EXISTS "base_symbol"`
    );
    await queryRunner.query(
      `ALTER TABLE "provider_deal_snapshots" DROP COLUMN IF EXISTS "quote_symbol"`
    );
    await queryRunner.query(
      `ALTER TABLE "provider_deal_snapshots" ADD CONSTRAINT "UQ_provider_deal_snapshots_provider_key" UNIQUE ("provider_key")`
    );
  }
}
