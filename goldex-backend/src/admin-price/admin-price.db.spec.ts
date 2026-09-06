import "reflect-metadata";
import { DataSource } from "typeorm";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { PricePairHistoryEntity } from "../admin-pair/entity/price-pair-history.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { PairPoolStatusEntity } from "../market-status/entity/pair-pool-status.entity";
import { ProviderEntity } from "../provider/entity/provider.entity";
import { AdminPriceService } from "./admin-price.service";
import { PriceEngineConfigEntity } from "./entity/price-engine-config.entity";

/**
 * Against a real database, because the parts worth checking here are SQL that
 * nothing else can typecheck: the history bucketing, the `DISTINCT ON` seed
 * query, the relation filter that finds each symbol's rial pair, and the
 * column names in the auto-spread counters. A mocked repository would have
 * agreed with any of those being wrong.
 *
 *   GOLDEX_DB_SPECS=1 npx jest src/admin-price/admin-price.db.spec.ts
 */
const ENABLED = process.env.GOLDEX_DB_SPECS === "1";
const describeDb = ENABLED ? describe : describe.skip;

/** Rows this spec wrote, so it never deletes a developer's own data. */
const TEST_PROVIDER = "jest-price-spec";
const OTHER_PROVIDER = "jest-price-spec-2";

let ds: DataSource;
let service: AdminPriceService;
let goldPairId: string;

const stubMarket = { getMultiplePrices: async () => ({}) } as any;
const stubStatus = { setOverrideForPair: async () => [] } as any;
const stubProviders = { setActiveByKey: async () => ({}) } as any;

async function record(at: Date, buy: number, sell: number, providerKey = TEST_PROVIDER) {
  await ds.query(
    `INSERT INTO "price_pair_histories"
       ("pair_id", "provider_key", "provider_item_id", "buy_price", "sell_price", "created_at")
     VALUES ($1, $2, 1, $3, $4, $5)`,
    [goldPairId, providerKey, buy, sell, at],
  );
}

beforeAll(async () => {
  if (!ENABLED) return;
  ds = new DataSource({
    type: "postgres",
    host: process.env.GOLDEX_AUTH_POSTGRES_URL ?? "/tmp",
    port: Number(process.env.GOLDEX_AUTH_POSTGRES_PORT ?? 5433),
    username: process.env.GOLDEX_AUTH_POSTGRES_USERNAME ?? "postgres",
    password: process.env.GOLDEX_AUTH_POSTGRES_PASSWORD ?? "postgres",
    database: process.env.GOLDEX_AUTH_POSTGRES_DBNAME ?? "base-db",
    // The whole entity graph, not the six this service touches: `price_pairs`
    // carries a many-to-many to user levels, which carries its own relations,
    // and TypeORM refuses to build metadata for half a graph.
    entities: ["src/**/*.entity.ts"],
    synchronize: false,
  });
  await ds.initialize();

  service = new AdminPriceService(
    ds.getRepository(SymbolEntity),
    ds.getRepository(PricePairEntity),
    ds.getRepository(PricePairHistoryEntity),
    ds.getRepository(PairPoolStatusEntity),
    ds.getRepository(ProviderEntity),
    ds.getRepository(PriceEngineConfigEntity),
    stubMarket,
    stubStatus,
    stubProviders,
  );

  const [pair] = await ds.query(
    `SELECT p."id" FROM "price_pairs" p
       JOIN "symbol" b ON b."id" = p."base_id"
       JOIN "symbol" q ON q."id" = p."quote_id"
      WHERE b."slug" = 'XAU' AND q."slug" = 'IRR' LIMIT 1`,
  );
  goldPairId = pair?.id;
  expect(goldPairId).toBeTruthy();
});

afterAll(async () => {
  if (!ENABLED) return;
  await ds.query(`DELETE FROM "price_pair_histories" WHERE "provider_key" = ANY($1)`, [
    [TEST_PROVIDER, OTHER_PROVIDER],
  ]);
  await ds.destroy();
});

beforeEach(async () => {
  if (!ENABLED) return;
  await ds.query(`DELETE FROM "price_pair_histories" WHERE "provider_key" = ANY($1)`, [
    [TEST_PROVIDER, OTHER_PROVIDER],
  ]);
});

describeDb("price history against real Postgres", () => {
  it("places each report in the bucket its timestamp falls in", async () => {
    const now = Date.now();
    // 4 buckets of 15 minutes across one hour.
    await record(new Date(now - 50 * 60_000), 100, 110);
    await record(new Date(now - 5 * 60_000), 300, 310);

    const dto = await service.historyFor({ symbols: "XAU", points: 4, hours: 1 } as any);
    expect(dto.rows.map((r) => r.XAU_buy)).toEqual([100, 100, 100, 300]);
  });

  it("keeps the most recent report within a bucket, not the first", async () => {
    const now = Date.now();
    await record(new Date(now - 8 * 60_000), 100, 110);
    await record(new Date(now - 2 * 60_000), 200, 210);

    const dto = await service.historyFor({ symbols: "XAU", points: 4, hours: 1 } as any);
    expect(dto.rows[3].XAU_buy).toBe(200);
  });

  it("seeds the chart from the last price before the window", async () => {
    await record(new Date(Date.now() - 6 * 3_600_000), 77, 88);

    const dto = await service.historyFor({ symbols: "XAU", points: 3, hours: 1 } as any);
    expect(dto.rows.map((r) => r.XAU_buy)).toEqual([77, 77, 77]);
    expect(dto.series[0].filledPoints).toBe(3);
  });

  it("filters to one provider when asked", async () => {
    const now = Date.now();
    await record(new Date(now - 2 * 60_000), 100, 110, TEST_PROVIDER);
    await record(new Date(now - 1 * 60_000), 999, 999, OTHER_PROVIDER);

    const mine = await service.historyFor({
      symbols: "XAU", points: 4, hours: 1, providerKey: TEST_PROVIDER,
    } as any);
    expect(mine.rows[3].XAU_buy).toBe(100);

    const both = await service.historyFor({ symbols: "XAU", points: 4, hours: 1 } as any);
    expect(both.rows[3].XAU_buy).toBe(999);
  });

  it("returns nulls, not zeros, for a window with nothing in or before it", async () => {
    const dto = await service.historyFor({ symbols: "XAU", points: 3, hours: 1 } as any);
    expect(dto.rows.map((r) => r.XAU_buy)).toEqual([null, null, null]);
  });

  it("charts several instruments on the same grid", async () => {
    await record(new Date(Date.now() - 60_000), 100, 110);
    const dto = await service.historyFor({ symbols: "XAU,USD", points: 3, hours: 1 } as any);
    expect(dto.series.map((s) => s.slug)).toEqual(["XAU", "USD"]);
    expect(dto.rows[0]).toHaveProperty("USD_buy");
    expect(dto.missing).toEqual([]);
  });

  it("reports a symbol with no rial pair as missing rather than empty", async () => {
    const dto = await service.historyFor({ symbols: "AED" } as any);
    expect(dto.missing).toEqual([{ slug: "AED", reason: "no-pair" }]);
  });
});

describeDb("instruments against real Postgres", () => {
  it("finds each symbol's rial pair through the relation filter", async () => {
    const items = (await service.instruments()).groups.flatMap((g) => g.items);
    const gold = items.find((i) => i.slug === "XAU");
    expect(gold?.pairId).toBe(goldPairId);
    expect(gold?.quoteSlug).toBe("IRR");
    // XAU/EUR, XAU/USD and XAU/AED exist too; only the rial one may be picked.
    expect(items.find((i) => i.slug === "AED")?.pairId).toBeNull();
  });

  it("leaves the rial symbol out of the catalogue", async () => {
    const items = (await service.instruments()).groups.flatMap((g) => g.items);
    expect(items.map((i) => i.slug)).not.toContain("IRR");
  });

  it("carries the seeded colours and derives the rest", async () => {
    const items = (await service.instruments()).groups.flatMap((g) => g.items);
    expect(items.find((i) => i.slug === "XAU")).toMatchObject({
      color: "#9A7B2C",
      colorConfigured: true,
    });
  });
});

describeDb("engine config against real Postgres", () => {
  it("reads the singleton row the migration seeded", async () => {
    const cfg = await service.engineConfig();
    expect(cfg.refreshIntervalSec).toBeGreaterThan(0);
  });

  it("counts spreads with the real column names", async () => {
    // A wrong column here throws rather than returning a wrong number, which is
    // exactly why this cannot be checked against a mock.
    const cfg = await service.engineConfig();
    expect(typeof cfg.autoSpread.pairsWithCommission).toBe("number");
    expect(typeof cfg.autoSpread.symbolsWithGain).toBe("number");
    expect(cfg.autoSpread.enabled).toBe(
      cfg.autoSpread.pairsWithCommission > 0 || cfg.autoSpread.symbolsWithGain > 0,
    );
  });

  it("round-trips the refresh interval", async () => {
    const before = (await service.engineConfig()).refreshIntervalSec;
    await service.updateEngineConfig({ refreshIntervalSec: before === 5 ? 7 : 5 });
    const after = (await service.engineConfig()).refreshIntervalSec;
    expect(after).not.toBe(before);
    await service.updateEngineConfig({ refreshIntervalSec: before });
    expect((await service.engineConfig()).refreshIntervalSec).toBe(before);
  });
});
