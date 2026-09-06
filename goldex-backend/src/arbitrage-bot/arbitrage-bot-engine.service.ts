import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, LessThan, Repository } from "typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import Decimal from "decimal.js";
import { ArbitrageBotEntity } from "./entity/arbitrage-bot.entity";
import { ArbitrageBotTradeEntity } from "./entity/arbitrage-bot-trade.entity";
import { ArbitrageBotService } from "./arbitrage-bot.service";
import {
  ArbitrageBotEventSeverityEnum,
  ArbitrageBotEventTypeEnum,
  ArbitrageBotExecutionModeEnum,
  ArbitrageBotStatusEnum,
  ArbitrageBotTradeStatusEnum,
} from "./enum/arbitrage-bot.enums";
import { DEFAULT_BOT_SCOPE, DEFAULT_BOT_THRESHOLDS } from "./arbitrage-bot.types";
import { ArbitrageSignal } from "../admin-arbitrage/arbitrage.types";
import { ProviderPairMappingEntity } from "../provider-pair-mapping/entity/provider-pair-mapping.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { SymbolTypeEnum } from "../admin-symbol/enum/symbol.type.enum";
import { RabbitMQService } from "../rabbitmq/rabbitmq.service";
import { MessagePatterns } from "../rabbitmq/interfaces/rabbitmq.interfaces";
import { ValuationService } from "../accounting/valuation.service";
import { ValuationBasisEnum } from "../accounting/enum/valuation-basis.enum";
import { ManagerAccountService } from "../manager-account/manager-account.service";

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/** How long the running-bot list and the pair mappings are reused. */
const CACHE_TTL_MS = 5_000;
/** Provider deal types, as the engine's place-order command expects them. */
const DEAL_TYPE = { BUY: 0, SELL: 1 } as const;

/**
 * Turns live arbitrage signals into bot decisions.
 *
 * Each running bot is a filter plus a risk budget. A signal has to clear the
 * bot's scope (pairs, markets, providers, items), its thresholds (profit,
 * freshness, rate limits) and its remaining loss budget before the bot acts on
 * it. Sizing is deliberately conservative: a bot never opens a position whose
 * cost exceeds the loss it is still allowed to take, so no single trade can
 * put more at risk than the capital its owner froze for it.
 *
 * Bots default to signal-only, where a match is recorded and notified but
 * nothing is ordered. Only a bot explicitly set to AUTO sends legs to the
 * providers.
 */
@Injectable()
export class ArbitrageBotEngineService implements OnModuleInit {
  private readonly logger = new Logger(ArbitrageBotEngineService.name);

  private botCache: { at: number; bots: ArbitrageBotEntity[] } | null = null;
  private mappingCache: { at: number; rows: ProviderPairMappingEntity[] } | null = null;
  private rialSymbolId: string | null = null;

  constructor(
    @InjectRepository(ArbitrageBotEntity)
    private readonly botRepo: Repository<ArbitrageBotEntity>,
    @InjectRepository(ArbitrageBotTradeEntity)
    private readonly tradeRepo: Repository<ArbitrageBotTradeEntity>,
    @InjectRepository(ProviderPairMappingEntity)
    private readonly mappingRepo: Repository<ProviderPairMappingEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pairRepo: Repository<PricePairEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    private readonly bots: ArbitrageBotService,
    private readonly managerAccounts: ManagerAccountService,
    private readonly valuation: ValuationService,
    private readonly rmq: RabbitMQService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rmq.subscribe(MessagePatterns.ARBITRAGE_SIGNAL, (msg) =>
      this.handleSignal(msg?.data as ArbitrageSignal)
    );
    this.logger.log("Arbitrage bots are listening for signals");
  }

  /** Drops the cached bot list, so a lifecycle change takes effect at once. */
  invalidate(): void {
    this.botCache = null;
  }

  // ── Signal handling ──────────────────────────────────────────────────────

  async handleSignal(signal: ArbitrageSignal): Promise<void> {
    if (!signal?.key || !signal.buyLeg || !signal.sellLeg) return;

    try {
      const bots = await this.runningBots();
      for (const bot of bots) {
        await this.evaluate(bot, signal).catch((err) =>
          this.logger.error(`bot ${bot.id} failed on signal ${signal.key}: ${err.message}`)
        );
      }
    } catch (err) {
      this.logger.error(`signal dispatch failed: ${(err as Error).message}`);
    }
  }

  private async evaluate(bot: ArbitrageBotEntity, signal: ArbitrageSignal): Promise<void> {
    const thresholds = { ...DEFAULT_BOT_THRESHOLDS, ...(bot.thresholds ?? {}) };

    if (!(await this.matchesScope(bot, signal))) return;
    if (!this.matchesThresholds(thresholds, signal)) return;
    if (!this.isFresh(thresholds, signal)) return;
    if (!this.pastCooldown(bot, thresholds)) return;

    if ((await this.bots.countOpenTrades(bot.id)) >= thresholds.maxOpenTrades) return;
    const hourAgo = new Date(Date.now() - 3600_000);
    if ((await this.bots.countTradesSince(bot.id, hourAgo)) >= thresholds.maxTradesPerHour) return;

    // The loss budget is the whole reason the allocation is frozen: once it is
    // gone the bot stops itself rather than trading on unbudgeted capital.
    const budget = this.bots.lossBudgetRemaining(bot);
    if (budget.lessThanOrEqualTo(0)) {
      await this.bots.haltById(
        bot.id,
        "حد ضرر تعیین‌شده مصرف شده است؛ ربات به‌صورت خودکار متوقف شد."
      );
      this.invalidate();
      return;
    }

    const volume = await this.sizeTrade(bot, signal, thresholds, budget);
    if (volume.lessThanOrEqualTo(0)) return;

    const expectedProfit = new Decimal(signal.profitRial ?? 0).times(volume);

    const trade = await this.tradeRepo.save(
      this.tradeRepo.create({
        botId: bot.id,
        signalKey: signal.key,
        signalId: signal.id ?? null,
        itemId: signal.itemId ?? null,
        itemName: signal.itemName ?? null,
        buyProviderKey: signal.buyLeg.providerKey,
        sellProviderKey: signal.sellLeg.providerKey,
        buyPrice: signal.buyLeg.price,
        sellPrice: signal.sellLeg.price,
        volume: volume.toNumber(),
        expectedProfitRial: expectedProfit.toNumber(),
        status: ArbitrageBotTradeStatusEnum.PLANNED,
        signal: signal as unknown as Record<string, any>,
      })
    );

    // Counters are written as a targeted update, never by saving this cached
    // entity: its `realizedLoss` may be seconds old, and writing it back would
    // undo a loss `settle` has since booked — which is what the stop-loss
    // measures.
    bot.matchedSignals = (bot.matchedSignals ?? 0) + 1;
    bot.lastSignalAt = new Date();
    await this.botRepo.update(bot.id, {
      matchedSignals: bot.matchedSignals,
      lastSignalAt: bot.lastSignalAt,
    });

    await this.bots.recordEvent(bot, {
      type: ArbitrageBotEventTypeEnum.SIGNAL_MATCHED,
      severity: ArbitrageBotEventSeverityEnum.INFO,
      title: `فرصت آربیتراژ برای ربات ${bot.name}`,
      message:
        `${signal.itemName ?? signal.itemId}: خرید از ${signal.buyLeg.providerKey} و فروش به ` +
        `${signal.sellLeg.providerKey} — سود تخمینی ${expectedProfit.toFixed(0)} ریال`,
      metadata: {
        signalKey: signal.key,
        volume: volume.toNumber(),
        expectedProfitRial: expectedProfit.toNumber(),
        profitPercent: signal.profitPercent,
      },
      tradeId: trade.id,
    });

    if (bot.executionMode === ArbitrageBotExecutionModeEnum.AUTO) {
      await this.submit(bot, trade, signal);
    }
  }

  // ── Filters ──────────────────────────────────────────────────────────────

  /**
   * Every list in the scope is a whitelist, and an empty list means "any". A
   * bot with no scope set therefore watches the whole market, which is the
   * only sensible reading of "not restricted".
   */
  private async matchesScope(bot: ArbitrageBotEntity, signal: ArbitrageSignal): Promise<boolean> {
    const scope = { ...DEFAULT_BOT_SCOPE, ...(bot.scope ?? {}) };

    if (scope.itemIds?.length && !scope.itemIds.includes(signal.itemId)) return false;

    if (scope.providerKeys?.length) {
      // Both legs must be permitted: a bot restricted to two providers should
      // not be handed a trade that reaches outside them.
      const allowed = new Set(scope.providerKeys);
      if (!allowed.has(signal.buyLeg.providerKey) || !allowed.has(signal.sellLeg.providerKey)) {
        return false;
      }
    }

    if (!scope.pricePairIds?.length && !scope.marketTypes?.length) return true;

    const pairs = await this.pairsForSignal(signal);
    if (pairs.length === 0) return false;

    if (scope.pricePairIds?.length) {
      const allowed = new Set(scope.pricePairIds);
      if (!pairs.some((p) => allowed.has(p.id))) return false;
    }

    if (scope.marketTypes?.length) {
      const allowed = new Set(scope.marketTypes.map((m) => String(m).toLowerCase()));
      const matches = pairs.some((p) => {
        const market = p.baseSymbol?.marketType ?? p.quoteSymbol?.marketType;
        return market ? allowed.has(String(market).toLowerCase()) : false;
      });
      if (!matches) return false;
    }

    return true;
  }

  private matchesThresholds(
    thresholds: typeof DEFAULT_BOT_THRESHOLDS,
    signal: ArbitrageSignal
  ): boolean {
    if ((signal.profitRial ?? 0) < thresholds.minProfitRial) return false;
    if ((signal.profitPercent ?? 0) < thresholds.minProfitPercent) return false;
    return true;
  }

  /**
   * An arbitrage on a quote nobody is honouring any more is not an
   * opportunity, so both the signal's own deadline and the bot's freshness
   * limit have to hold.
   */
  private isFresh(thresholds: typeof DEFAULT_BOT_THRESHOLDS, signal: ArbitrageSignal): boolean {
    const now = Date.now();

    if (signal.deadline) {
      const deadline = new Date(signal.deadline).getTime();
      if (Number.isFinite(deadline) && deadline <= now) return false;
    }

    const detectedAt = signal.detectedAt ? new Date(signal.detectedAt).getTime() : NaN;
    if (Number.isFinite(detectedAt)) {
      if (now - detectedAt > thresholds.maxQuoteAgeSeconds * 1000) return false;
    }
    return true;
  }

  private pastCooldown(
    bot: ArbitrageBotEntity,
    thresholds: typeof DEFAULT_BOT_THRESHOLDS
  ): boolean {
    if (!bot.lastTradeAt || !thresholds.cooldownSeconds) return true;
    return Date.now() - new Date(bot.lastTradeAt).getTime() >= thresholds.cooldownSeconds * 1000;
  }

  // ── Sizing ───────────────────────────────────────────────────────────────

  /**
   * How much the bot may trade on this signal.
   *
   * Two caps apply, both in the traded item's own unit. The owner's
   * `maxTradeVolume` is the ceiling, and the position's cost in Rial may not
   * exceed the loss the bot is still allowed to take — the remaining budget,
   * held in the allocation's asset, valued at the live rate. The second cap is
   * what makes "the bot may trade while it is within its stop-loss" literally
   * true: it can never hold more than it can afford to lose.
   */
  private async sizeTrade(
    bot: ArbitrageBotEntity,
    signal: ArbitrageSignal,
    thresholds: typeof DEFAULT_BOT_THRESHOLDS,
    budgetInAsset: Decimal
  ): Promise<Decimal> {
    const buyPrice = new Decimal(signal.buyLeg?.price ?? 0);
    if (buyPrice.lessThanOrEqualTo(0)) return new Decimal(0);

    const budgetRial = await this.toRial(bot, budgetInAsset);
    if (budgetRial.lessThanOrEqualTo(0)) return new Decimal(0);

    const affordable = budgetRial.dividedBy(buyPrice);
    const ceiling =
      thresholds.maxTradeVolume > 0 ? new Decimal(thresholds.maxTradeVolume) : affordable;

    return Decimal.min(affordable, ceiling);
  }

  /** Values an amount of the bot's allocation asset in Rial at live prices. */
  private async toRial(bot: ArbitrageBotEntity, amount: Decimal): Promise<Decimal> {
    const rialId = await this.getRialSymbolId();
    if (!rialId || !bot.symbolId) return new Decimal(0);
    if (bot.symbolId === rialId) return amount;

    const rate = await this.valuation.getRate(
      bot.symbolId,
      rialId,
      ValuationBasisEnum.BID,
      DEFAULT_BOT_THRESHOLDS.maxQuoteAgeSeconds
    );
    // No live rate means no defensible size — trading blind against an
    // unpriceable budget is worse than skipping the opportunity.
    if (rate.rate === null) {
      this.logger.warn(`bot ${bot.id}: allocation asset has no live rate to rial`);
      return new Decimal(0);
    }
    return amount.times(rate.rate);
  }

  private async fromRial(bot: ArbitrageBotEntity, rial: Decimal): Promise<Decimal> {
    const rialId = await this.getRialSymbolId();
    if (!rialId || !bot.symbolId) return new Decimal(0);
    if (bot.symbolId === rialId) return rial;

    const rate = await this.valuation.getRate(
      bot.symbolId,
      rialId,
      ValuationBasisEnum.BID,
      DEFAULT_BOT_THRESHOLDS.maxQuoteAgeSeconds
    );
    if (rate.rate === null || rate.rate === 0) return new Decimal(0);
    return rial.dividedBy(rate.rate);
  }

  // ── Execution ────────────────────────────────────────────────────────────

  /**
   * Sends both legs to the pricing-engine, which owns provider order
   * placement. Each leg carries a client order id namespaced with `bot:` so
   * the settlement consumer can tell a bot leg from a customer order.
   */
  private async submit(
    bot: ArbitrageBotEntity,
    trade: ArbitrageBotTradeEntity,
    signal: ArbitrageSignal
  ): Promise<void> {
    const legs = {
      buy: { clientOrderId: `bot:${trade.id}:buy`, status: "SUBMITTED" as string },
      sell: { clientOrderId: `bot:${trade.id}:sell`, status: "SUBMITTED" as string },
    };

    try {
      await this.rmq.publishCommand(
        MessagePatterns.PROVIDER_COMMAND_PLACE_ORDER,
        {
          key: signal.buyLeg.providerKey,
          itemId: signal.itemId,
          dealType: DEAL_TYPE.BUY,
          count: Number(trade.volume),
          price: Number(trade.buyPrice),
          clientOrderId: legs.buy.clientOrderId,
        },
        signal.buyLeg.providerKey
      );
      await this.rmq.publishCommand(
        MessagePatterns.PROVIDER_COMMAND_PLACE_ORDER,
        {
          key: signal.sellLeg.providerKey,
          itemId: signal.itemId,
          dealType: DEAL_TYPE.SELL,
          count: Number(trade.volume),
          price: Number(trade.sellPrice),
          clientOrderId: legs.sell.clientOrderId,
        },
        signal.sellLeg.providerKey
      );
    } catch (err) {
      trade.status = ArbitrageBotTradeStatusEnum.FAILED;
      trade.failureReason = (err as Error).message;
      trade.legs = legs;
      await this.tradeRepo.save(trade);

      await this.bots.recordEvent(bot, {
        type: ArbitrageBotEventTypeEnum.ERROR,
        severity: ArbitrageBotEventSeverityEnum.CRITICAL,
        title: `ارسال سفارش ربات ${bot.name} ناموفق بود`,
        message: (err as Error).message,
        tradeId: trade.id,
      });
      return;
    }

    trade.status = ArbitrageBotTradeStatusEnum.SUBMITTED;
    trade.submittedAt = new Date();
    trade.legs = legs;
    await this.tradeRepo.save(trade);

    bot.totalTrades = (bot.totalTrades ?? 0) + 1;
    bot.lastTradeAt = new Date();
    await this.botRepo.update(bot.id, {
      totalTrades: bot.totalTrades,
      lastTradeAt: bot.lastTradeAt,
    });

    await this.bots.recordEvent(bot, {
      type: ArbitrageBotEventTypeEnum.TRADE_SUBMITTED,
      severity: ArbitrageBotEventSeverityEnum.INFO,
      title: `ربات ${bot.name} سفارش ثبت کرد`,
      message:
        `حجم ${trade.volume} — خرید از ${trade.buyProviderKey} و فروش به ${trade.sellProviderKey}`,
      metadata: { expectedProfitRial: Number(trade.expectedProfitRial) },
      tradeId: trade.id,
    });
  }

  // ── Settlement ───────────────────────────────────────────────────────────

  /**
   * Applies one leg's outcome. A trade settles only when both legs have
   * reported: half a settled arbitrage is not a result, it is an open
   * position, and booking it early would misstate the bot's losses.
   */
  async applyLegResult(
    tradeId: string,
    leg: "buy" | "sell",
    filled: boolean,
    reason?: string
  ): Promise<void> {
    const trade = await this.tradeRepo.findOne({ where: { id: tradeId } });
    if (!trade) return;
    if (trade.status === ArbitrageBotTradeStatusEnum.FILLED) return;
    if (trade.status === ArbitrageBotTradeStatusEnum.FAILED) return;

    const legs = { ...(trade.legs ?? {}) } as Record<string, any>;
    legs[leg] = { ...(legs[leg] ?? {}), status: filled ? "FILLED" : "FAILED", reason: reason ?? null };
    trade.legs = legs;

    const buyDone = legs.buy?.status === "FILLED" || legs.buy?.status === "FAILED";
    const sellDone = legs.sell?.status === "FILLED" || legs.sell?.status === "FAILED";
    if (!buyDone || !sellDone) {
      await this.tradeRepo.save(trade);
      return;
    }

    const bothFilled = legs.buy?.status === "FILLED" && legs.sell?.status === "FILLED";
    await this.settle(trade, bothFilled, reason);
  }

  /**
   * Books the trade's result against the bot's frozen allocation and halts the
   * bot if that consumed its stop-loss budget.
   *
   * A one-sided fill is the expensive case: the bot holds an unhedged leg, so
   * the loss is taken as the full cost of the filled side rather than pretended
   * to be zero.
   */
  private async settle(
    trade: ArbitrageBotTradeEntity,
    bothFilled: boolean,
    reason?: string
  ): Promise<void> {
    const bot = await this.botRepo.findOne({ where: { id: trade.botId } });
    if (!bot) return;

    const legs = (trade.legs ?? {}) as Record<string, any>;
    let profitRial: Decimal;

    if (bothFilled) {
      profitRial = new Decimal(trade.sellPrice)
        .minus(trade.buyPrice)
        .times(trade.volume);
    } else if (legs.buy?.status === "FILLED") {
      // Bought and could not sell: the position's cost is at risk.
      profitRial = new Decimal(trade.buyPrice).times(trade.volume).negated();
    } else if (legs.sell?.status === "FILLED") {
      // Sold without the offsetting buy: exposed for the sold notional.
      profitRial = new Decimal(trade.sellPrice).times(trade.volume).negated();
    } else {
      profitRial = new Decimal(0);
    }

    const pnlAsset = await this.fromRial(bot, profitRial);

    trade.status = bothFilled
      ? ArbitrageBotTradeStatusEnum.FILLED
      : ArbitrageBotTradeStatusEnum.FAILED;
    trade.realizedProfitRial = profitRial.toNumber();
    trade.realizedPnlAsset = pnlAsset.toNumber();
    trade.settledAt = new Date();
    if (!bothFilled) trade.failureReason = reason ?? "one or both legs did not fill";
    await this.tradeRepo.save(trade);

    if (bot.managerAccountId && !pnlAsset.isZero()) {
      await this.managerAccounts.bookBotResult(
        bot.managerAccountId,
        bot.id,
        pnlAsset.toNumber(),
        `arbitrage bot ${bot.name} trade ${trade.id}`
      );
    }

    bot.realizedPnl = new Decimal(bot.realizedPnl).plus(pnlAsset).toNumber();
    if (pnlAsset.isNegative()) {
      bot.realizedLoss = new Decimal(bot.realizedLoss).plus(pnlAsset.negated()).toNumber();
    }
    // Safe to save the whole row: this bot was loaded fresh at the top of the
    // settlement, unlike the cached instances the signal path works with.
    await this.botRepo.save(bot);

    await this.bots.recordEvent(bot, {
      type: bothFilled
        ? ArbitrageBotEventTypeEnum.TRADE_FILLED
        : ArbitrageBotEventTypeEnum.TRADE_FAILED,
      severity: bothFilled
        ? ArbitrageBotEventSeverityEnum.INFO
        : ArbitrageBotEventSeverityEnum.WARNING,
      title: bothFilled
        ? `معامله ربات ${bot.name} انجام شد`
        : `معامله ربات ${bot.name} ناموفق بود`,
      message: `نتیجه: ${profitRial.toFixed(0)} ریال${reason ? ` — ${reason}` : ""}`,
      metadata: { profitRial: profitRial.toNumber(), pnlAsset: pnlAsset.toNumber() },
      tradeId: trade.id,
    });

    await this.checkRisk(bot);
    this.invalidate();
  }

  /**
   * Halts a bot that has spent its loss budget, and warns once it is close.
   * The warning exists so a manager can top the bot up or narrow its scope
   * before the stop-loss takes the decision out of their hands.
   */
  private async checkRisk(bot: ArbitrageBotEntity): Promise<void> {
    const stopLoss = new Decimal(bot.stopLossAmount);
    if (stopLoss.lessThanOrEqualTo(0)) return;

    const used = new Decimal(bot.realizedLoss).dividedBy(stopLoss).times(100);

    if (used.greaterThanOrEqualTo(100)) {
      await this.bots.halt(
        bot,
        `زیان محقق‌شده (${bot.realizedLoss}) به حد ضرر (${bot.stopLossAmount}) رسید.`
      );
      return;
    }

    const warnAt = bot.notifications?.lossWarningPercent ?? 70;
    if (used.greaterThanOrEqualTo(warnAt)) {
      await this.bots.recordEvent(bot, {
        type: ArbitrageBotEventTypeEnum.LOSS_WARNING,
        severity: ArbitrageBotEventSeverityEnum.WARNING,
        title: `ربات ${bot.name} به آستانه هشدار زیان رسید`,
        message: `${used.toFixed(1)}٪ از بودجه حد ضرر مصرف شده است.`,
        metadata: {
          usedPercent: used.toNumber(),
          realizedLoss: Number(bot.realizedLoss),
          stopLossAmount: Number(bot.stopLossAmount),
        },
      });
    }
  }

  /**
   * Signal-only matches are never submitted, so they would otherwise sit open
   * forever and consume the bot's concurrency budget. Anything still planned
   * after its signal could plausibly be acted on is closed out.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireStalePlannedTrades(): Promise<void> {
    const cutoff = new Date(Date.now() - 10 * 60_000);
    const stale = await this.tradeRepo.find({
      where: { status: ArbitrageBotTradeStatusEnum.PLANNED, createAt: LessThan(cutoff) },
      take: 500,
    });
    if (stale.length === 0) return;

    for (const trade of stale) {
      trade.status = ArbitrageBotTradeStatusEnum.CANCELLED;
      trade.failureReason = "opportunity expired before execution";
      trade.settledAt = new Date();
    }
    await this.tradeRepo.save(stale);
  }

  // ── Caches and lookups ───────────────────────────────────────────────────

  private async runningBots(): Promise<ArbitrageBotEntity[]> {
    if (this.botCache && Date.now() - this.botCache.at < CACHE_TTL_MS) {
      return this.botCache.bots;
    }
    const bots = await this.botRepo.find({
      where: { status: ArbitrageBotStatusEnum.RUNNING },
    });
    this.botCache = { at: Date.now(), bots };
    return bots;
  }

  /** Price pairs a signal's provider item is mapped to, for scope filtering. */
  private async pairsForSignal(signal: ArbitrageSignal): Promise<PricePairEntity[]> {
    const mappings = await this.mappings();
    const pairIds = new Set(
      mappings
        .filter(
          (m) =>
            m.providerItemId === signal.itemId &&
            (m.providerKey === signal.buyLeg.providerKey ||
              m.providerKey === signal.sellLeg.providerKey)
        )
        .map((m) => m.pairId)
    );
    if (pairIds.size === 0) return [];

    return this.pairRepo.find({
      where: { id: In([...pairIds]) },
      relations: { baseSymbol: true, quoteSymbol: true },
    });
  }

  private async mappings(): Promise<ProviderPairMappingEntity[]> {
    if (this.mappingCache && Date.now() - this.mappingCache.at < CACHE_TTL_MS) {
      return this.mappingCache.rows;
    }
    const rows = await this.mappingRepo.find();
    this.mappingCache = { at: Date.now(), rows };
    return rows;
  }

  private async getRialSymbolId(): Promise<string | null> {
    if (this.rialSymbolId) return this.rialSymbolId;
    const rial = await this.symbolRepo.findOne({
      where: { symbolType: SymbolTypeEnum.RIAL },
      order: { createAt: "ASC" },
    });
    this.rialSymbolId = rial?.id ?? null;
    return this.rialSymbolId;
  }
}
