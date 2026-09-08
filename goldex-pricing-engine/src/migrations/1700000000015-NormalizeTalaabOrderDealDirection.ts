import { MigrationInterface, QueryRunner } from 'typeorm';

// Deals placed with Talaab stored the provider's own `type_text`, which reads
// from the SHOP's side and is therefore the mirror of ours: a platform BUY was
// persisted as 'فروش' and counted as a sell in the deal-balance aggregate.
// Fetched Talaab transactions were already normalized, so only the
// order-placed rows (orderId is the trade request id, not a 'txn-' sanad) need
// rewriting to the platform's direction.
export class NormalizeTalaabOrderDealDirection1700000000015 implements MigrationInterface {
  name = 'NormalizeTalaabOrderDealDirection1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('provider_deals');
    if (!table) return;
    await queryRunner.query(`
      UPDATE provider_deals
         SET "dealTypeStr" = CASE WHEN "dealType" = 0 THEN 'خرید' ELSE 'فروش' END
       WHERE "providerCategory" = 'talaab'
         AND ("orderId" IS NULL OR "orderId" NOT LIKE 'txn-%')
         AND "dealType" IS NOT NULL
    `);
  }

  public async down(): Promise<void> {
    // The pre-normalization value was the provider's mirrored text; restoring it
    // would only reintroduce the miscount, so this is intentionally one-way.
  }
}
