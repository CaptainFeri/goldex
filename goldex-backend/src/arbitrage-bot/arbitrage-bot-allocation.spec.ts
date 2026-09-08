import { ArbitrageBotService } from "./arbitrage-bot.service";
import { ArbitrageBotStatusEnum } from "./enum/arbitrage-bot.enums";
import Decimal from "decimal.js";

/**
 * The service is built from its prototype so the tests exercise the funding
 * rules without a database, a broker or the module's other collaborators.
 */
function service(over: Record<string, any> = {}): any {
  const svc = Object.create(ArbitrageBotService.prototype);
  Object.assign(svc, { logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() }, ...over });
  return svc;
}

const actor = { id: "admin-1", role: "admin" as any };

function allocationRepo(rows: any[] = []) {
  return {
    rows,
    find: jest.fn().mockImplementation(async () => rows),
    findOne: jest.fn().mockImplementation(async ({ where }: any) =>
      rows.find((r) => r.botId === where.botId && r.symbolId === where.symbolId) ?? null
    ),
    create: jest.fn().mockImplementation((data: any) => ({ ...data })),
    save: jest.fn().mockImplementation(async (row: any) => {
      if (!rows.includes(row)) rows.push(row);
      return row;
    }),
  };
}

describe("allocating several assets to one bot", () => {
  function harness(rows: any[] = []) {
    const repo = allocationRepo(rows);
    const managerAccounts = {
      getOrCreateAccount: jest
        .fn()
        .mockImplementation(async (_admin: string, symbolId: string) => ({ id: `acct-${symbolId}` })),
      allocateToBot: jest.fn().mockResolvedValue(undefined),
      releaseFromBot: jest.fn().mockResolvedValue(undefined),
    };
    const bot = { id: "bot-1", ownerAdminId: actor.id, stopLossPercent: 80, status: "DRAFT" };
    const svc = service({
      allocationRepo: repo,
      managerAccounts,
      getOwned: jest.fn().mockResolvedValue(bot),
    });
    return { svc, repo, managerAccounts, bot };
  }

  it("adds a second asset as its own allocation with its own budget", async () => {
    const { svc, repo } = harness();
    await svc.allocate("bot-1", { symbolId: "irr", amount: 100_000_000_000 }, actor);
    await svc.allocate("bot-1", { symbolId: "gold", amount: 10 }, actor);

    expect(repo.rows).toHaveLength(2);
    expect(repo.rows.map((r: any) => r.symbolId)).toEqual(["irr", "gold"]);
    // The bot's default percent applies to each asset separately.
    expect(repo.rows[0].stopLossAmount).toBe(80_000_000_000);
    expect(repo.rows[1].stopLossAmount).toBe(8);
  });

  it("tops up an asset the bot already holds instead of duplicating it", async () => {
    const { svc, repo } = harness();
    await svc.allocate("bot-1", { symbolId: "gold", amount: 10 }, actor);
    await svc.allocate("bot-1", { symbolId: "gold", amount: 5 }, actor);

    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].allocatedAmount).toBe(15);
    expect(repo.rows[0].stopLossAmount).toBe(12);
  });

  it("freezes each amount from the account holding that asset", async () => {
    const { svc, managerAccounts } = harness();
    await svc.allocate("bot-1", { symbolId: "irr", amount: 100 }, actor);
    await svc.allocate("bot-1", { symbolId: "gold", amount: 10 }, actor);

    expect(managerAccounts.allocateToBot).toHaveBeenNthCalledWith(1, "acct-irr", "bot-1", 100, actor.id);
    expect(managerAccounts.allocateToBot).toHaveBeenNthCalledWith(2, "acct-gold", "bot-1", 10, actor.id);
  });

  it("honours a per-asset stop-loss over the bot's default", async () => {
    const { svc, repo } = harness();
    await svc.allocate("bot-1", { symbolId: "gold", amount: 10, stopLossPercent: 25 }, actor);
    expect(repo.rows[0].stopLossAmount).toBe(2.5);
  });
});

describe("releasing capital", () => {
  function harness(status = ArbitrageBotStatusEnum.PAUSED) {
    const rows = [
      { id: "a1", botId: "bot-1", symbolId: "irr", managerAccountId: "acct-irr", allocatedAmount: 100, stopLossPercent: 100, stopLossAmount: 100 },
      { id: "a2", botId: "bot-1", symbolId: "gold", managerAccountId: "acct-gold", allocatedAmount: 10, stopLossPercent: 100, stopLossAmount: 10 },
    ];
    const repo = allocationRepo(rows);
    const managerAccounts = { releaseFromBot: jest.fn().mockResolvedValue(undefined) };
    const bot = { id: "bot-1", ownerAdminId: actor.id, status };
    const svc = service({
      allocationRepo: repo,
      managerAccounts,
      getOwned: jest.fn().mockResolvedValue(bot),
    });
    return { svc, repo, managerAccounts };
  }

  it("releases every asset when no symbol is named", async () => {
    const { svc, managerAccounts, repo } = harness();
    await svc.release("bot-1", {}, actor);
    expect(managerAccounts.releaseFromBot).toHaveBeenCalledTimes(2);
    expect(repo.rows.every((r: any) => r.allocatedAmount === 0)).toBe(true);
  });

  it("releases only the named asset", async () => {
    const { svc, managerAccounts, repo } = harness();
    await svc.release("bot-1", { symbolId: "gold", amount: 4 }, actor);
    expect(managerAccounts.releaseFromBot).toHaveBeenCalledTimes(1);
    expect(managerAccounts.releaseFromBot).toHaveBeenCalledWith("acct-gold", "bot-1", 4, actor.id);
    expect(repo.rows[1].allocatedAmount).toBe(6);
    expect(repo.rows[0].allocatedAmount).toBe(100);
  });

  it("refuses an amount that does not say which asset it belongs to", async () => {
    const { svc } = harness();
    await expect(svc.release("bot-1", { amount: 5 }, actor)).rejects.toThrow(
      "ARBITRAGE_BOT.RELEASE_AMOUNT_NEEDS_SYMBOL"
    );
  });

  it("refuses to empty an allocation out from under a running bot", async () => {
    const { svc } = harness(ArbitrageBotStatusEnum.RUNNING);
    await expect(svc.release("bot-1", { symbolId: "gold" }, actor)).rejects.toThrow(
      "ARBITRAGE_BOT.STOP_BEFORE_FULL_RELEASE"
    );
  });
});

describe("loss budgets", () => {
  it("measures each allocation against its own stop-loss", () => {
    const svc = service();
    const budget = svc.allocationBudget({ stopLossAmount: 10, realizedLoss: 3 });
    expect(budget).toBeInstanceOf(Decimal);
    expect(budget.toNumber()).toBe(7);
  });
});
