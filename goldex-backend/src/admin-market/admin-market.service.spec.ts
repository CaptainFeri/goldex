import { Repository } from "typeorm";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { MarketService } from "../websocket/market.service";
import { AdminMarketService, TICKER_FRESHNESS_WINDOW_SECONDS } from "./admin-market.service";

const symbol = (over: Partial<SymbolEntity>): SymbolEntity =>
  ({
    id: "s-1",
    slug: "USD",
    name: "دلار آمریکا",
    isTicker: true,
    displayOrder: 20,
    ...over,
  }) as SymbolEntity;

const quote = (over: Record<string, unknown> = {}) => ({
  displayBuyPrice: 8_925_000,
  displaySellPrice: 8_935_000,
  displayBuyGramPrice: 0,
  displaySellGramPrice: 0,
  lastUpdated: new Date().toISOString(),
  ...over,
});

function build(symbols: SymbolEntity[], prices: Record<string, unknown>) {
  const repo = { find: jest.fn().mockResolvedValue(symbols) } as unknown as Repository<SymbolEntity>;
  const market = {
    getMultiplePrices: jest.fn().mockResolvedValue(prices),
  } as unknown as MarketService;
  return { service: new AdminMarketService(repo, market), repo, market };
}

describe("AdminMarketService.getTicker", () => {
  it("quotes each ticker symbol through its rial pair", async () => {
    const { service, market } = build([symbol({})], { "USD-IRR": quote() });
    const ticker = await service.getTicker();

    expect(market.getMultiplePrices).toHaveBeenCalledWith(["USD-IRR"]);
    expect(ticker.items).toHaveLength(1);
    expect(ticker.items[0]).toMatchObject({
      slug: "USD",
      label: "دلار آمریکا",
      buyPrice: 8_925_000,
      sellPrice: 8_935_000,
      quoteSlug: "IRR",
      stale: false,
    });
  });

  it("reports prices in rial, unconverted", async () => {
    // The panel divides by ten and labels it toman. If the API converted too,
    // the ticker would read a tenth of the real rate.
    const { service } = build([symbol({})], { "USD-IRR": quote({ displaySellPrice: 8_935_000 }) });
    const [item] = (await service.getTicker()).items;
    expect(item.sellPrice).toBe(8_935_000);
    expect(item.quoteSlug).toBe("IRR");
  });

  it("orders by displayOrder, which it asks the database for", async () => {
    const { service, repo } = build([], {});
    await service.getTicker();
    expect((repo.find as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { isTicker: true },
      order: { displayOrder: "ASC", slug: "ASC" },
    });
  });

  it("keeps an unquoted instrument in the list, marked stale", async () => {
    // Dropping it would make a half-configured ticker look complete.
    const { service } = build([symbol({ slug: "AED", name: "درهم امارات" })], {});
    const [item] = (await service.getTicker()).items;
    expect(item).toMatchObject({ slug: "AED", buyPrice: null, sellPrice: null, quoteSlug: null, stale: true });
  });

  it("marks a quote older than the freshness window stale", async () => {
    const old = new Date(Date.now() - (TICKER_FRESHNESS_WINDOW_SECONDS + 5) * 1000).toISOString();
    const { service } = build([symbol({})], { "USD-IRR": quote({ lastUpdated: old }) });
    expect((await service.getTicker()).items[0].stale).toBe(true);
  });

  it("treats a zero price as no quote rather than a free instrument", async () => {
    const { service } = build([symbol({})], {
      "USD-IRR": quote({ displayBuyPrice: 0, displaySellPrice: 0 }),
    });
    const [item] = (await service.getTicker()).items;
    expect(item.buyPrice).toBeNull();
    expect(item.sellPrice).toBeNull();
  });

  it("carries the panel's own key when one is set, and null when it is not", async () => {
    const { service } = build(
      [symbol({ tickerKey: "usdToman" }), symbol({ id: "s-2", slug: "XAU", name: "طلای جهانی" })],
      { "USD-IRR": quote(), "XAU-IRR": quote() },
    );
    const items = (await service.getTicker()).items;
    expect(items.map((i) => i.tickerKey)).toEqual(["usdToman", null]);
  });

  it("asks for no prices when nothing is flagged", async () => {
    const { service, market } = build([], {});
    const ticker = await service.getTicker();
    expect(market.getMultiplePrices).not.toHaveBeenCalled();
    expect(ticker.items).toEqual([]);
    expect(ticker.freshnessWindowSeconds).toBe(TICKER_FRESHNESS_WINDOW_SECONDS);
  });
});
