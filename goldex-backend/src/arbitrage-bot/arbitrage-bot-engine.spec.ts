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

describe("funding direction", () => {
  const pairs = [{ id: "pair-1", baseId: "gold-18", quoteId: "irr" }];

  it("buys first when the bot holds the pair's quote asset (cash)", async () => {
    const svc = engine({ pairsForSignal: jest.fn().mockResolvedValue(pairs) });
    await expect(svc.resolveFundingDirection({ symbolId: "irr" }, signal)).resolves.toBe(
      ArbitrageBotFundingDirectionEnum.BUY_FIRST
    );
  });

  it("sells first when the bot holds the pair's base asset (the metal)", async () => {
    const svc = engine({ pairsForSignal: jest.fn().mockResolvedValue(pairs) });
    await expect(svc.resolveFundingDirection({ symbolId: "gold-18" }, signal)).resolves.toBe(
      ArbitrageBotFundingDirectionEnum.SELL_FIRST
    );
  });

  it("returns null when the bot holds neither side of the pair", async () => {
    const svc = engine({ pairsForSignal: jest.fn().mockResolvedValue(pairs) });
    await expect(svc.resolveFundingDirection({ symbolId: "usdt" }, signal)).resolves.toBeNull();
  });

  it("returns null when no allocation asset is set at all", async () => {
    const svc = engine({ pairsForSignal: jest.fn() });
    await expect(svc.resolveFundingDirection({}, signal)).resolves.toBeNull();
  });
});

describe("direction-aware sizing", () => {
  const thresholds = { ...DEFAULT_BOT_THRESHOLDS, maxTradeVolume: 0 };
  const bot: any = { id: "bot-1", symbolId: "irr" };

  it("sizes a buy-first trade against the buy leg's price", async () => {
    const svc = engine({ toRial: jest.fn().mockResolvedValue(new Decimal(10_000_000)) });
    const volume = await svc.sizeTrade(
      bot,
      signal,
      thresholds,
      new Decimal(10_000_000),
      ArbitrageBotFundingDirectionEnum.BUY_FIRST
    );
    expect(volume.toNumber()).toBe(10);
  });

  it("sizes a sell-first trade against the sell leg's price", async () => {
    const svc = engine({ toRial: jest.fn().mockResolvedValue(new Decimal(11_000_000)) });
    const volume = await svc.sizeTrade(
      bot,
      signal,
      thresholds,
      new Decimal(11_000_000),
      ArbitrageBotFundingDirectionEnum.SELL_FIRST
    );
    expect(volume.toNumber()).toBe(10);
  });

  it("still respects the owner's max trade volume", async () => {
    const svc = engine({ toRial: jest.fn().mockResolvedValue(new Decimal(10_000_000)) });
    const volume = await svc.sizeTrade(
      bot,
      signal,
      { ...DEFAULT_BOT_THRESHOLDS, maxTradeVolume: 4 },
      new Decimal(10_000_000),
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
