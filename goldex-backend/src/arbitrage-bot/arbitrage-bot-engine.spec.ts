import { ArbitrageBotEngineService } from "./arbitrage-bot-engine.service";
import { ArbitrageBotFundingDirectionEnum } from "./enum/arbitrage-bot.enums";
import { DEFAULT_BOT_THRESHOLDS } from "./arbitrage-bot.types";
import Decimal from "decimal.js";

/**
 * The engine opens a broker connection and a cron in its constructor, so the
 * tests drive the prototype directly with only the collaborators each path
 * actually touches.
 */
function engine(overrides: Record<string, any> = {}): any {
  const svc = Object.create(ArbitrageBotEngineService.prototype);
  Object.assign(svc, {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    ...overrides,
  });
  return svc;
}

const signal: any = {
  key: "sig-1",
  itemId: "item-1",
  buyLeg: { providerKey: "prov-a", price: 1_000_000 },
  sellLeg: { providerKey: "prov-b", price: 1_100_000 },
};

/** An allocation with room left in its budget, unless told otherwise. */
function alloc(symbolId: string, over: Record<string, any> = {}): any {
  return {
    id: `alloc-${symbolId}`,
    symbolId,
    managerAccountId: `acct-${symbolId}`,
    allocatedAmount: 1_000,
    stopLossAmount: 1_000,
    realizedLoss: 0,
    ...over,
  };
}

/** The real budget rule, so the tests exercise it rather than a stand-in. */
const bots = {
  allocationBudget: (a: any) => new Decimal(a.stopLossAmount).minus(a.realizedLoss),
};

describe("funding direction", () => {
  const pairs = [{ id: "pair-1", baseId: "gold-18", quoteId: "irr" }];
  const svc = () => engine({ bots, pairsForSignal: jest.fn().mockResolvedValue(pairs) });

  it("buys first when funded with the pair's quote asset (cash)", async () => {
    const funding = await svc().resolveFunding([alloc("irr")], signal);
    expect(funding.direction).toBe(ArbitrageBotFundingDirectionEnum.BUY_FIRST);
    expect(funding.allocation.symbolId).toBe("irr");
  });

  it("sells first when funded with the pair's base asset (the metal)", async () => {
    const funding = await svc().resolveFunding([alloc("gold-18")], signal);
    expect(funding.direction).toBe(ArbitrageBotFundingDirectionEnum.SELL_FIRST);
    expect(funding.allocation.symbolId).toBe("gold-18");
  });

  it("prefers buying first when the bot holds both sides", async () => {
    const funding = await svc().resolveFunding([alloc("gold-18"), alloc("irr")], signal);
    expect(funding.direction).toBe(ArbitrageBotFundingDirectionEnum.BUY_FIRST);
    expect(funding.allocation.symbolId).toBe("irr");
  });

  it("falls back to the asset it can still afford when the cash budget is spent", async () => {
    const spent = alloc("irr", { realizedLoss: 1_000 });
    const funding = await svc().resolveFunding([spent, alloc("gold-18")], signal);
    expect(funding.direction).toBe(ArbitrageBotFundingDirectionEnum.SELL_FIRST);
    expect(funding.allocation.symbolId).toBe("gold-18");
  });

  it("returns null when no allocation matches either side of the pair", async () => {
    await expect(svc().resolveFunding([alloc("usdt")], signal)).resolves.toBeNull();
  });

  it("returns null when the bot is unfunded", async () => {
    await expect(svc().resolveFunding([], signal)).resolves.toBeNull();
  });
});

describe("direction-aware sizing", () => {
  const thresholds = { ...DEFAULT_BOT_THRESHOLDS, maxTradeVolume: 0 };
  const bot: any = { id: "bot-1" };

  it("sizes a buy-first trade against the buy leg's price", async () => {
    const svc = engine({ bots, toRial: jest.fn().mockResolvedValue(new Decimal(10_000_000)) });
    const volume = await svc.sizeTrade(
      bot,
      signal,
      thresholds,
      alloc("irr", { stopLossAmount: 10_000_000 }),
      ArbitrageBotFundingDirectionEnum.BUY_FIRST
    );
    expect(volume.toNumber()).toBe(10);
  });

  it("sizes a sell-first trade against the sell leg's price", async () => {
    const svc = engine({ bots, toRial: jest.fn().mockResolvedValue(new Decimal(11_000_000)) });
    const volume = await svc.sizeTrade(
      bot,
      signal,
      thresholds,
      alloc("gold-18", { stopLossAmount: 10 }),
      ArbitrageBotFundingDirectionEnum.SELL_FIRST
    );
    expect(volume.toNumber()).toBe(10);
  });

  it("values the budget of the asset that is paying, not the bot's total", async () => {
    const toRial = jest.fn().mockResolvedValue(new Decimal(10_000_000));
    const svc = engine({ bots, toRial });
    await svc.sizeTrade(
      bot,
      signal,
      thresholds,
      alloc("gold-18", { stopLossAmount: 10, realizedLoss: 2 }),
      ArbitrageBotFundingDirectionEnum.SELL_FIRST
    );
    expect(toRial).toHaveBeenCalledWith("gold-18", expect.anything());
    expect(toRial.mock.calls[0][1].toNumber()).toBe(8);
  });

  it("still respects the owner's max trade volume", async () => {
    const svc = engine({ bots, toRial: jest.fn().mockResolvedValue(new Decimal(10_000_000)) });
    const volume = await svc.sizeTrade(
      bot,
      signal,
      { ...DEFAULT_BOT_THRESHOLDS, maxTradeVolume: 4 },
      alloc("irr", { stopLossAmount: 10_000_000 }),
      ArbitrageBotFundingDirectionEnum.BUY_FIRST
    );
    expect(volume.toNumber()).toBe(4);
  });
});

describe("leg submission", () => {
  function submitHarness() {
    const publishCommand = jest.fn().mockResolvedValue(true);
    const update = jest.fn().mockResolvedValue(undefined);
    const svc = engine({
      rmq: { publishCommand },
      botRepo: { update },
      tradeRepo: { save: jest.fn().mockResolvedValue(undefined) },
      bots: { recordEvent: jest.fn().mockResolvedValue(undefined) },
      notifier: { botEvent: jest.fn().mockResolvedValue(undefined) },
    });
    return { svc, publishCommand, update };
  }

  const trade: any = {
    id: "trade-1",
    volume: 2,
    buyPrice: 1_000_000,
    sellPrice: 1_100_000,
    buyProviderKey: "prov-a",
    sellProviderKey: "prov-b",
    expectedProfitRial: 200_000,
  };
  const bot: any = { id: "bot-1", name: "bot", totalTrades: 3, totalTransactions: 6 };

  it("sends the buy leg first when the bot is funded with cash", async () => {
    const { svc, publishCommand } = submitHarness();
    await svc.submit({ ...bot }, trade, signal, ArbitrageBotFundingDirectionEnum.BUY_FIRST);
    expect(publishCommand.mock.calls.map((c: any[]) => c[1].dealType)).toEqual([0, 1]);
  });

  it("sends the sell leg first when the bot is funded with the asset", async () => {
    const { svc, publishCommand } = submitHarness();
    await svc.submit({ ...bot }, trade, signal, ArbitrageBotFundingDirectionEnum.SELL_FIRST);
    expect(publishCommand.mock.calls.map((c: any[]) => c[1].dealType)).toEqual([1, 0]);
  });

  it("counts one cycle as two provider transactions", async () => {
    const { svc, update } = submitHarness();
    await svc.submit({ ...bot }, trade, signal, ArbitrageBotFundingDirectionEnum.BUY_FIRST);
    expect(update).toHaveBeenCalledWith(
      "bot-1",
      expect.objectContaining({ totalTrades: 4, totalTransactions: 8 })
    );
  });
});
