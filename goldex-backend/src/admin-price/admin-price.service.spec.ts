import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MarketStatus } from "../market-status/entity/pair-pool-status.entity";
import { AdminPriceService, UNCATEGORISED } from "./admin-price.service";
import { fallbackColor } from "./instrument-color";

const S = {
  gold: { id: "s-gold", slug: "XAU", name: "طلا", category: "طلا", displayOrder: 10, color: "#9A7B2C", tickerKey: null },
  usd: { id: "s-usd", slug: "USD", name: "دلار", category: "ارز", displayOrder: 20, color: null, tickerKey: "usdToman" },
  eur: { id: "s-eur", slug: "EUR", name: "یورو", category: "ارز", displayOrder: 30, color: null, tickerKey: null },
  loose: { id: "s-loose", slug: "TRX", name: "ترون", category: null, displayOrder: 40, color: null, tickerKey: null },
  rial: { id: "s-irr", slug: "IRR", name: "ریال", category: null, displayOrder: 0, color: null, tickerKey: null },
};

const PAIRS = [
  { id: "p-gold", baseId: "s-gold" },
  { id: "p-usd", baseId: "s-usd" },
  { id: "p-loose", baseId: "s-loose" },
];

function build(over: Record<string, any> = {}) {
  const counts = { pairsWithCommission: 1, symbolsWithGain: 0, ...(over.counts ?? {}) };
  const qb = (value: number) => ({
    where: () => qb(value),
    andWhere: () => qb(value),
    getCount: async () => value,
  });

  const symbols = {
    find: jest.fn(async () => over.symbols ?? Object.values(S)),
    findOne: jest.fn(async ({ where }: any) =>
      Object.values(S).find((s) => s.id === where.id) ?? null,
    ),
    createQueryBuilder: () => qb(counts.symbolsWithGain),
  };
  const pairs = {
    find: jest.fn(async () => over.pairs ?? PAIRS),
    createQueryBuilder: () => qb(counts.pairsWithCommission),
  };
  const history = { query: jest.fn(async () => over.historyRows ?? []) };
  const poolStatus = { find: jest.fn(async () => over.statusRows ?? []) };
  const providers = {
    find: jest.fn(async () => over.providers ?? []),
  };
  const config = {
    // `?? ` would swallow a deliberate null, which is the case this mock exists
    // to let a test express.
    findOne: jest.fn(async () =>
      "configRow" in over ? over.configRow : { singleton: true, refreshIntervalSec: 3, updateAt: null },
    ),
    save: jest.fn(async (row: any) => row),
  };
  const market = { getMultiplePrices: jest.fn(async () => over.prices ?? {}) };
  const marketStatus = { setOverrideForPair: jest.fn(async () => []) };
  const providerService = { setActiveByKey: jest.fn(async () => ({})) };

  const service = new AdminPriceService(
    symbols as any, pairs as any, history as any, poolStatus as any,
    providers as any, config as any, market as any, marketStatus as any, providerService as any,
  );
  return { service, symbols, pairs, history, poolStatus, providers, config, market, marketStatus, providerService };
}

const flat = (dto: any) => dto.groups.flatMap((g: any) => g.items);

describe("instruments", () => {
  it("excludes the rial symbol — it is the unit, not an instrument", async () => {
    const { service } = build();
    const slugs = flat(await service.instruments()).map((i: any) => i.slug);
    expect(slugs).not.toContain("IRR");
    expect(slugs).toEqual(["XAU", "USD", "EUR", "TRX"]);
  });

  it("groups uncategorised instruments rather than dropping them", async () => {
    const { service } = build();
    const dto = await service.instruments();
    expect(dto.groups.map((g) => g.category)).toEqual(["طلا", "ارز", UNCATEGORISED]);
    expect(dto.groups[2].items.map((i) => i.slug)).toEqual(["TRX"]);
    expect(dto.total).toBe(4);
  });

  it("orders groups by where their first instrument falls, not alphabetically", async () => {
    // display_order is the desk's one lever; alphabetical grouping would ignore it.
    const { service } = build();
    const dto = await service.instruments();
    expect(dto.groups[0].category).toBe("طلا");
  });

  it("filters by category, counting سایر as a category", async () => {
    const { service } = build();
    expect(flat(await service.instruments({ category: "ارز" })).map((i: any) => i.slug)).toEqual([
      "USD",
      "EUR",
    ]);
    expect(flat(await service.instruments({ category: UNCATEGORISED })).map((i: any) => i.slug)).toEqual([
      "TRX",
    ]);
  });

  it("searches name, slug and ticker key case-insensitively", async () => {
    const { service } = build();
    expect(flat(await service.instruments({ search: "xau" })).map((i: any) => i.slug)).toEqual(["XAU"]);
    expect(flat(await service.instruments({ search: "usdtoman" })).map((i: any) => i.slug)).toEqual(["USD"]);
    expect(flat(await service.instruments({ search: "یورو" })).map((i: any) => i.slug)).toEqual(["EUR"]);
  });

  it("reports display prices, which is what a customer is quoted", async () => {
    const { service } = build({
      prices: {
        "XAU-IRR": {
          displayBuyPrice: 101, displaySellPrice: 99,
          displayBuyGramPrice: 11, displaySellGramPrice: 9,
          lastUpdated: new Date().toISOString(),
        },
      },
    });
    const gold = flat(await service.instruments()).find((i: any) => i.slug === "XAU");
    expect(gold).toMatchObject({ buy: 101, sell: 99, buyGram: 11, sellGram: 9, stale: false });
  });

  it("marks an instrument with no quote stale rather than dropping it", async () => {
    const { service } = build();
    const usd = flat(await service.instruments()).find((i: any) => i.slug === "USD");
    expect(usd).toMatchObject({ buy: null, sell: null, stale: true });
  });

  it("marks an old quote stale", async () => {
    const { service } = build({
      prices: { "XAU-IRR": { displayBuyPrice: 5, lastUpdated: new Date(Date.now() - 60_000).toISOString() } },
    });
    expect(flat(await service.instruments()).find((i: any) => i.slug === "XAU").stale).toBe(true);
  });

  it("reports no pair as null prices and a null quote symbol", async () => {
    const { service } = build();
    const eur = flat(await service.instruments()).find((i: any) => i.slug === "EUR");
    expect(eur).toMatchObject({ pairId: null, quoteSlug: null, marketOpen: null });
  });

  it("carries the market pool status and whether an admin forced it", async () => {
    const { service } = build({
      statusRows: [
        { pairId: "p-gold", effectiveStatus: MarketStatus.OPEN, reason: "price-fresh", adminOverride: null },
        { pairId: "p-usd", effectiveStatus: MarketStatus.CLOSED, reason: "admin-override", adminOverride: MarketStatus.CLOSED },
      ],
    });
    const items = flat(await service.instruments());
    expect(items.find((i: any) => i.slug === "XAU")).toMatchObject({
      marketOpen: true, marketStatusReason: "price-fresh", marketOverridden: false,
    });
    expect(items.find((i: any) => i.slug === "USD")).toMatchObject({
      marketOpen: false, marketStatusReason: "admin-override", marketOverridden: true,
    });
  });

  it("reports a never-reconciled pair as unknown, not as closed", async () => {
    const { service } = build({ statusRows: [] });
    expect(flat(await service.instruments()).find((i: any) => i.slug === "XAU").marketOpen).toBeNull();
  });

  it("derives a colour when the symbol has none, and says which it did", async () => {
    const { service } = build();
    const items = flat(await service.instruments());
    expect(items.find((i: any) => i.slug === "XAU")).toMatchObject({
      color: "#9A7B2C", colorConfigured: true,
    });
    expect(items.find((i: any) => i.slug === "USD")).toMatchObject({
      color: fallbackColor("USD"), colorConfigured: false,
    });
  });

  it("does not ask the price cache for anything when nothing matched", async () => {
    const { service, market } = build();
    await service.instruments({ search: "nothing-matches-this" });
    expect(market.getMultiplePrices).not.toHaveBeenCalled();
  });
});

describe("setMarketStatus", () => {
  it("forces every pool of the instrument's pair closed", async () => {
    const { service, marketStatus } = build();
    await service.setMarketStatus("s-gold", { open: false });
    expect(marketStatus.setOverrideForPair).toHaveBeenCalledWith("p-gold", MarketStatus.CLOSED);
  });

  it("forces them open", async () => {
    const { service, marketStatus } = build();
    await service.setMarketStatus("s-gold", { open: true });
    expect(marketStatus.setOverrideForPair).toHaveBeenCalledWith("p-gold", MarketStatus.OPEN);
  });

  it("clears the override on null — the only way back to automatic derivation", async () => {
    const { service, marketStatus } = build();
    await service.setMarketStatus("s-gold", { open: null });
    expect(marketStatus.setOverrideForPair).toHaveBeenCalledWith("p-gold", null);
  });

  it("404s for an unknown instrument", async () => {
    const { service } = build();
    await expect(service.setMarketStatus("s-nope", { open: true })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("400s for an instrument with no pair, rather than silently doing nothing", async () => {
    const { service, marketStatus } = build();
    await expect(service.setMarketStatus("s-eur", { open: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(marketStatus.setOverrideForPair).not.toHaveBeenCalled();
  });

  it("returns the instrument as it now stands", async () => {
    const { service } = build({
      statusRows: [{ pairId: "p-gold", effectiveStatus: MarketStatus.CLOSED, reason: "admin-override", adminOverride: MarketStatus.CLOSED }],
    });
    const dto = await service.setMarketStatus("s-gold", { open: false });
    expect(dto).toMatchObject({ slug: "XAU", marketOpen: false, marketOverridden: true });
  });
});

describe("history", () => {
  it("rejects an empty symbol list instead of returning an empty chart", async () => {
    const { service } = build();
    await expect(service.historyFor({ symbols: " , " } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("names every slug it could not chart, and why", async () => {
    const { service } = build();
    const dto = await service.historyFor({ symbols: "XAU,EUR,NOPE" } as any);
    expect(dto.series.map((s) => s.slug)).toEqual(["XAU"]);
    expect(dto.missing).toEqual([
      { slug: "EUR", reason: "no-pair" },
      { slug: "NOPE", reason: "unknown-symbol" },
    ]);
  });

  it("builds one aligned grid, oldest first", async () => {
    const { service } = build();
    const dto = await service.historyFor({ symbols: "XAU", points: 4, hours: 1 } as any);
    expect(dto.rows).toHaveLength(4);
    expect(dto.rows.map((r) => r.i)).toEqual([0, 1, 2, 3]);
    expect(Date.parse(dto.rows[0].at as string)).toBeLessThan(Date.parse(dto.rows[3].at as string));
    expect(dto.bucketSeconds).toBe(900);
  });

  it("places each bucket's price on the grid and carries it across gaps", async () => {
    const { service } = build({
      historyRows: [
        { pairId: "p-gold", bucket: 0, buyPrice: "100", sellPrice: "110" },
        { pairId: "p-gold", bucket: 2, buyPrice: "120", sellPrice: "130" },
      ],
    });
    const dto = await service.historyFor({ symbols: "XAU", points: 4, hours: 1 } as any);
    expect(dto.rows.map((r) => r.XAU_buy)).toEqual([100, 100, 120, 120]);
    expect(dto.rows.map((r) => r.XAU_sell)).toEqual([110, 110, 130, 130]);
    expect(dto.series[0].filledPoints).toBe(4);
  });

  it("leaves a series with no history null rather than zero", async () => {
    const { service } = build();
    const dto = await service.historyFor({ symbols: "XAU", points: 3, hours: 1 } as any);
    expect(dto.rows.map((r) => r.XAU_buy)).toEqual([null, null, null]);
    expect(dto.series[0].filledPoints).toBe(0);
  });

  it("opens the chart on the last price before the window, when there is one", async () => {
    const { service, history } = build();
    // Second call is the seed query; first is the bucket query.
    history.query
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [{ pairId: "p-gold", buyPrice: "90", sellPrice: "95" }]);
    const dto = await service.historyFor({ symbols: "XAU", points: 3, hours: 1 } as any);
    expect(dto.rows.map((r) => r.XAU_buy)).toEqual([90, 90, 90]);
  });

  it("publishes the key names, so a client need not build them", async () => {
    const { service } = build();
    const dto = await service.historyFor({ symbols: "XAU" } as any);
    expect(dto.series[0]).toMatchObject({ buyKey: "XAU_buy", sellKey: "XAU_sell" });
    expect(Object.keys(dto.rows[0])).toEqual(expect.arrayContaining(["i", "at", "XAU_buy", "XAU_sell"]));
  });

  it("refuses more series than a chart can carry", async () => {
    const { service } = build();
    const many = Array.from({ length: 26 }, (_, i) => `S${i}`).join(",");
    await expect(service.historyFor({ symbols: many } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not touch the database when nothing chartable was asked for", async () => {
    const { service, history } = build();
    const dto = await service.historyFor({ symbols: "NOPE" } as any);
    expect(history.query).not.toHaveBeenCalled();
    expect(dto.series).toEqual([]);
  });
});

describe("engine config", () => {
  const providers = [
    { id: "pr-1", key: "tgju", persianName: "تی‌جی‌جی‌یو", category: "gold", active: true, status: "connected", lastStatusChangeAt: null },
    { id: "pr-2", key: "brsapi", persianName: null, category: "gold", active: false, status: "inactive", lastStatusChangeAt: null },
  ];

  it("serves the providers as sources, not a copy of them", async () => {
    const { service } = build({ providers });
    const cfg = await service.engineConfig();
    expect(cfg.sources.map((s) => s.key)).toEqual(["tgju", "brsapi"]);
    expect(cfg.sources[1].label).toBeNull();
    expect(cfg.refreshIntervalSec).toBe(3);
  });

  it("derives autoSpread from what is actually configured", async () => {
    const on = build({ providers, counts: { pairsWithCommission: 2, symbolsWithGain: 0 } });
    expect((await on.service.engineConfig()).autoSpread).toMatchObject({
      enabled: true, pairsWithCommission: 2, symbolsWithGain: 0, writable: false,
    });

    const off = build({ providers, counts: { pairsWithCommission: 0, symbolsWithGain: 0 } });
    expect((await off.service.engineConfig()).autoSpread.enabled).toBe(false);
  });

  it("counts a symbol gain as a spread too", async () => {
    const { service } = build({ providers, counts: { pairsWithCommission: 0, symbolsWithGain: 1 } });
    expect((await service.engineConfig()).autoSpread.enabled).toBe(true);
  });

  it("500s rather than inventing defaults when the singleton row is missing", async () => {
    const { service } = build({ providers, configRow: null });
    await expect(service.engineConfig()).rejects.toBeInstanceOf(NotFoundException);
  });

  it("stores a new refresh interval", async () => {
    const { service, config } = build({ providers });
    await service.updateEngineConfig({ refreshIntervalSec: 10 });
    expect(config.save).toHaveBeenCalledWith(expect.objectContaining({ refreshIntervalSec: 10 }));
  });

  it("accepts autoSpread echoed back unchanged, so a client can PATCH the whole object", async () => {
    const { service } = build({ providers, counts: { pairsWithCommission: 1 } });
    await expect(service.updateEngineConfig({ autoSpread: true })).resolves.toBeDefined();
  });

  it("refuses to change autoSpread — that is the desk's margin on every quote", async () => {
    const { service, config } = build({ providers, counts: { pairsWithCommission: 1 } });
    await expect(service.updateEngineConfig({ autoSpread: false })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(config.save).not.toHaveBeenCalled();
  });

  it("toggles a source through the provider service, which publishes the engine command", async () => {
    const { service, providerService } = build({ providers });
    await service.updateEngineConfig({ sources: [{ key: "brsapi", active: true }] });
    expect(providerService.setActiveByKey).toHaveBeenCalledWith("brsapi", true);
  });

  it("rejects an unknown source before applying any of them", async () => {
    const { service, providerService } = build({ providers });
    await expect(
      service.updateEngineConfig({ sources: [{ key: "tgju", active: false }, { key: "ghost", active: true }] }),
    ).rejects.toThrow(/UNKNOWN_SOURCE:ghost/);
    // Half a config change is worse than none: nothing on the screen would say
    // which half landed.
    expect(providerService.setActiveByKey).not.toHaveBeenCalled();
  });

  it("rejects the same source named twice, which has no defined outcome", async () => {
    const { service } = build({ providers });
    await expect(
      service.updateEngineConfig({ sources: [{ key: "tgju", active: true }, { key: "tgju", active: false }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
