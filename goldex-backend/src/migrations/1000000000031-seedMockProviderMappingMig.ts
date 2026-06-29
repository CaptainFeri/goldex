import { MigrationInterface, QueryRunner } from "typeorm";

// Maps the XAU/IRR pair to the three sandbox providers, all on item 101
// (سکه امامی in the mock catalog). The pair-price consumer aggregates the best
// buy/sell across whichever providers report a price for item 101.
const MOCK_MAPPINGS: { providerKey: string; itemId: number }[] = [
  { providerKey: "mock-zaryar-a", itemId: 101 },
  { providerKey: "mock-zaryar-b", itemId: 101 },
  { providerKey: "mock-talaab-a", itemId: 101 },
];

export class SeedMockProviderMappingMig1000000000031 implements MigrationInterface {
  name = "SeedMockProviderMappingMig1000000000031";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const pairResult = await queryRunner.query(
      `SELECT pp.id
       FROM price_pairs pp
       JOIN symbol bs ON bs.id = pp.base_id
       JOIN symbol qs ON qs.id = pp.quote_id
      WHERE bs.slug = $1 AND qs.slug = $2
      LIMIT 1`,
      ["XAU", "IRR"]
    );

    if (pairResult.length === 0) {
      console.log("XAU/IRR price pair not found. Skipping mock provider mapping seed.");
      return;
    }

    const pairId = pairResult[0].id;

    for (const m of MOCK_MAPPINGS) {
      const existing = await queryRunner.query(
        `SELECT id FROM provider_pair_mappings
        WHERE pair_id = $1 AND provider_key = $2 AND provider_item_id = $3
        LIMIT 1`,
        [pairId, m.providerKey, m.itemId]
      );
      if (existing.length > 0) continue;

      await queryRunner.query(
        `INSERT INTO provider_pair_mappings
         (pair_id, provider_key, provider_item_id, use_buy_price, use_sell_price, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [pairId, m.providerKey, m.itemId, true, true]
      );
      console.log(`Mock provider mapping inserted: XAU/IRR -> ${m.providerKey} item ${m.itemId}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const pairResult = await queryRunner.query(
      `SELECT pp.id FROM price_pairs pp
         JOIN symbol bs ON bs.id = pp.base_id
         JOIN symbol qs ON qs.id = pp.quote_id
        WHERE bs.slug = $1 AND qs.slug = $2
        LIMIT 1`,
      ["XAU", "IRR"]
    );

    if (pairResult.length > 0) {
      await queryRunner.query(
        `DELETE FROM provider_pair_mappings
          WHERE pair_id = $1 AND provider_key = ANY($2) AND provider_item_id = 101`,
        [pairResult[0].id, MOCK_MAPPINGS.map((m) => m.providerKey)]
      );
      console.log("Mock provider mappings removed.");
    }
  }
}
