import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, MoreThan, Repository } from "typeorm";
import Decimal from "decimal.js";
import { ArbitrageBotEntity } from "./entity/arbitrage-bot.entity";
import { ArbitrageBotTradeEntity } from "./entity/arbitrage-bot-trade.entity";
import { ArbitrageBotEventEntity } from "./entity/arbitrage-bot-event.entity";
import { ArbitrageBotAllocationEntity } from "./entity/arbitrage-bot-allocation.entity";
import {
  ArbitrageBotEventSeverityEnum,
  ArbitrageBotEventTypeEnum,
  ArbitrageBotExecutionModeEnum,
  ArbitrageBotStatusEnum,
  ArbitrageBotTradeStatusEnum,
} from "./enum/arbitrage-bot.enums";
import {
  ArbitrageBotSummary,
  ArbitrageBotNotificationConfig,
  ArbitrageBotScope,
  ArbitrageBotThresholds,
  DEFAULT_BOT_NOTIFICATIONS,
  DEFAULT_BOT_SCOPE,
  DEFAULT_BOT_THRESHOLDS,
} from "./arbitrage-bot.types";
import { CreateArbitrageBotDto } from "./dto/create-arbitrage-bot.dto";
import { UpdateArbitrageBotDto } from "./dto/update-arbitrage-bot.dto";
import { AllocateCapitalDto, ReleaseCapitalDto } from "./dto/allocate-capital.dto";
import { paginate } from "../shared/dto/paginated.dto";
import { pageOf } from "../shared/dto/page-of";
import { ManagerAccountService } from "../manager-account/manager-account.service";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { ArbitrageBotNotifierService } from "./arbitrage-bot-notifier.service";
import { ValuationService } from "../accounting/valuation.service";
import { ValuationBasisEnum } from "../accounting/enum/valuation-basis.enum";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { SymbolTypeEnum } from "../admin-symbol/enum/symbol.type.enum";

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface BotActor {
  id: string;
  role: AdminRole;
}

/**
 * Bot definitions and their lifecycle: create, configure, fund, run, stop.
 *
 * The interesting rule here is that capital and running state are coupled. A
 * bot cannot start without a frozen allocation, because the allocation *is*
 * its loss limit; and stopping a bot releases whatever survives, because
 * capital frozen behind an idle bot is capital the manager cannot use.
 */
@Injectable()
export class ArbitrageBotService {
  private readonly logger = new Logger(ArbitrageBotService.name);
  private rialId: string | null | undefined;

  constructor(
    @InjectRepository(ArbitrageBotEntity)
    private readonly botRepo: Repository<ArbitrageBotEntity>,
    @InjectRepository(ArbitrageBotTradeEntity)
    private readonly tradeRepo: Repository<ArbitrageBotTradeEntity>,
    @InjectRepository(ArbitrageBotEventEntity)
    private readonly eventRepo: Repository<ArbitrageBotEventEntity>,
    @InjectRepository(ArbitrageBotAllocationEntity)
    private readonly allocationRepo: Repository<ArbitrageBotAllocationEntity>,
    private readonly managerAccounts: ManagerAccountService,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    private readonly notifier: ArbitrageBotNotifierService,
    private readonly valuation: ValuationService,
    private readonly dataSource: DataSource
  ) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async create(dto: CreateArbitrageBotDto, actor: BotActor): Promise<ArbitrageBotEntity> {
    const bot = this.botRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      ownerAdminId: actor.id,
      status: ArbitrageBotStatusEnum.DRAFT,
      executionMode: dto.executionMode ?? ArbitrageBotExecutionModeEnum.SIGNAL_ONLY,
      scope: this.mergeScope(DEFAULT_BOT_SCOPE, dto.scope),
      thresholds: this.mergeThresholds(DEFAULT_BOT_THRESHOLDS, dto.thresholds),
      notifications: this.mergeNotifications(DEFAULT_BOT_NOTIFICATIONS, dto.notifications),
      stopLossPercent: dto.stopLossPercent ?? 100,
    });

    const saved = await this.botRepo.save(bot);

    // Funding at creation time is the normal flow — the manager decides how
    // much of which accounts this bot may risk as they define it. Several
    // assets at once is the point: cash lets it buy first, the metal lets it
    // sell first, and a bot given both can act on either direction.
    const lines = this.requestedAllocations(dto);
    try {
      for (const line of lines) {
        await this.allocate(saved.id, line, actor);
      }
    } catch (err) {
      // A second asset can fail on balance after the first is already frozen.
      // Leaving the manager with capital locked behind a half-made bot is
      // worse than the original error, so undo before reporting it.
      await this.releaseAll(saved, actor.id).catch((releaseErr) =>
        this.logger.error(
          `failed to unwind allocations of bot ${saved.id}: ${(releaseErr as Error).message}`
        )
      );
      await this.botRepo.remove(saved);
      throw err;
    }
    return this.getOwned(saved.id, actor);
  }

  /**
   * The allocations a create request asks for, accepting both the list form
   * and the older single-asset fields so an existing caller keeps working.
   */
  private requestedAllocations(dto: CreateArbitrageBotDto): AllocateCapitalDto[] {
    if (dto.allocations?.length) {
      return dto.allocations.filter((line) => Number(line.amount) > 0);
    }
    if (dto.symbolId && Number(dto.allocatedAmount) > 0) {
      return [
        {
          symbolId: dto.symbolId,
          amount: dto.allocatedAmount as number,
          stopLossPercent: dto.stopLossPercent,
        },
      ];
    }
    return [];
  }

  async update(id: string, dto: UpdateArbitrageBotDto, actor: BotActor): Promise<ArbitrageBotEntity> {
    const bot = await this.getOwned(id, actor);

    if (dto.name !== undefined) bot.name = dto.name;
    if (dto.description !== undefined) bot.description = dto.description;
    if (dto.executionMode !== undefined) bot.executionMode = dto.executionMode;
    if (dto.scope) bot.scope = this.mergeScope(bot.scope ?? DEFAULT_BOT_SCOPE, dto.scope);
    if (dto.thresholds) {
      bot.thresholds = this.mergeThresholds(bot.thresholds ?? DEFAULT_BOT_THRESHOLDS, dto.thresholds);
    }
    if (dto.notifications) {
      bot.notifications = this.mergeNotifications(
        bot.notifications ?? DEFAULT_BOT_NOTIFICATIONS,
        dto.notifications
      );
    }
    if (dto.stopLossPercent !== undefined) {
      // The bot-level percent is the default for new allocations, and changing
      // it re-measures the ones already there: a manager who moves the line
      // means it for the capital the bot is holding now.
      bot.stopLossPercent = dto.stopLossPercent;
      for (const allocation of await this.allocationsOf(bot.id)) {
        allocation.stopLossPercent = dto.stopLossPercent;
        allocation.stopLossAmount = this.budgetFor(allocation.allocatedAmount, dto.stopLossPercent);
        await this.allocationRepo.save(allocation);
      }
    }

    await this.botRepo.save(bot);
    return this.getOwned(id, actor);
  }

  async list(filters: { ownerAdminId?: string; status?: ArbitrageBotStatusEnum } = {}) {
    const bots = await this.botRepo.find({
      where: {
        ...(filters.ownerAdminId ? { ownerAdminId: filters.ownerAdminId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      relations: { allocations: { symbol: true }, ownerAdmin: true },
      order: { createAt: "DESC" },
    });
    return bots.map((b) => this.present(b));
  }

  async get(id: string) {
    const bot = await this.botRepo.findOne({
      where: { id },
      relations: { allocations: { symbol: true }, ownerAdmin: true },
    });
    if (!bot) throw new NotFoundException("ARBITRAGE_BOT.NOT_FOUND");
    return this.present(bot);
  }

  async remove(id: string, actor: BotActor): Promise<void> {
    const bot = await this.getOwned(id, actor);
    if (bot.status === ArbitrageBotStatusEnum.RUNNING) {
      throw new BadRequestException("ARBITRAGE_BOT.STOP_BEFORE_DELETE");
    }
    // Deleting must never strand frozen capital in a bot nobody can see, in
    // any of the assets it holds.
    await this.releaseAll(bot, actor.id);
    await this.botRepo.softRemove(bot);
  }

  // ── Capital ──────────────────────────────────────────────────────────────

  /**
   * Freezes capital from one of the owner's manager accounts into this bot.
   *
   * Each asset is its own allocation with its own loss budget. Allocating an
   * asset the bot already holds tops that allocation up and re-measures its
   * budget against the new total, so raising an allocation also raises the
   * line at which the bot stops using it.
   */
  async allocate(id: string, dto: AllocateCapitalDto, actor: BotActor): Promise<ArbitrageBotEntity> {
    const bot = await this.getOwned(id, actor);

    const account = await this.managerAccounts.getOrCreateAccount(bot.ownerAdminId, dto.symbolId);
    await this.managerAccounts.allocateToBot(account.id, bot.id, dto.amount, actor.id);

    const existing = await this.allocationRepo.findOne({
      where: { botId: bot.id, symbolId: dto.symbolId },
    });
    const percent = dto.stopLossPercent ?? existing?.stopLossPercent ?? bot.stopLossPercent ?? 100;
    const amount = new Decimal(existing?.allocatedAmount ?? 0).plus(dto.amount).toNumber();

    const allocation =
      existing ??
      this.allocationRepo.create({
        botId: bot.id,
        symbolId: dto.symbolId,
        managerAccountId: account.id,
      });
    allocation.managerAccountId = account.id;
    allocation.allocatedAmount = amount;
    allocation.stopLossPercent = percent;
    allocation.stopLossAmount = this.budgetFor(amount, percent);
    await this.allocationRepo.save(allocation);

    return this.getOwned(id, actor);
  }

  /**
   * Returns frozen capital to the manager account it came from. A running bot
   * keeps at least the capital its stop-loss is measured against, so emptying
   * an allocation entirely requires stopping the bot first.
   */
  async release(id: string, dto: ReleaseCapitalDto, actor: BotActor): Promise<ArbitrageBotEntity> {
    const bot = await this.getOwned(id, actor);
    const allocations = await this.allocationsOf(bot.id);
    if (allocations.length === 0) throw new BadRequestException("ARBITRAGE_BOT.NOT_FUNDED");

    // Without an asset the request means "all of it", which is the only
    // reading that does not silently pick one of several allocations.
    const targets = dto.symbolId
      ? allocations.filter((a) => a.symbolId === dto.symbolId)
      : allocations;
    if (targets.length === 0) throw new BadRequestException("ARBITRAGE_BOT.NOT_FUNDED");
    if (dto.amount !== undefined && targets.length > 1) {
      throw new BadRequestException("ARBITRAGE_BOT.RELEASE_AMOUNT_NEEDS_SYMBOL");
    }

    for (const allocation of targets) {
      const allocated = new Decimal(allocation.allocatedAmount);
      const requested = dto.amount === undefined ? allocated : new Decimal(dto.amount);
      if (requested.greaterThan(allocated)) {
        throw new BadRequestException("ARBITRAGE_BOT.RELEASE_EXCEEDS_ALLOCATION");
      }
      if (bot.status === ArbitrageBotStatusEnum.RUNNING && requested.equals(allocated)) {
        throw new BadRequestException("ARBITRAGE_BOT.STOP_BEFORE_FULL_RELEASE");
      }
      if (!requested.greaterThan(0)) continue;

      await this.managerAccounts.releaseFromBot(
        allocation.managerAccountId,
        bot.id,
        requested.toNumber(),
        actor.id
      );
      allocation.allocatedAmount = allocated.minus(requested).toNumber();
      allocation.stopLossAmount = this.budgetFor(
        allocation.allocatedAmount,
        allocation.stopLossPercent
      );
      await this.allocationRepo.save(allocation);
    }

    return this.getOwned(id, actor);
  }

  /** Every allocation of a bot, oldest first so the list reads stably. */
  async allocationsOf(botId: string): Promise<ArbitrageBotAllocationEntity[]> {
    return this.allocationRepo.find({
      where: { botId },
      relations: { symbol: true },
      order: { createAt: "ASC" },
    });
  }

  /** Unfreezes everything a bot holds, in every asset. */
  private async releaseAll(bot: ArbitrageBotEntity, actorAdminId: string): Promise<void> {
    for (const allocation of await this.allocationsOf(bot.id)) {
      if (!(Number(allocation.allocatedAmount) > 0)) continue;
      await this.managerAccounts.releaseFromBot(
        allocation.managerAccountId,
        bot.id,
        allocation.allocatedAmount,
        actorAdminId
      );
      allocation.allocatedAmount = 0;
      allocation.stopLossAmount = 0;
      await this.allocationRepo.save(allocation);
    }
  }

  /** What an allocation of this size may lose, at this percent. */
  private budgetFor(amount: number | string, percent: number | string): number {
    return new Decimal(amount).times(percent).dividedBy(100).toNumber();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async start(id: string, actor: BotActor): Promise<ArbitrageBotEntity> {
    const bot = await this.getOwned(id, actor);

    if (bot.status === ArbitrageBotStatusEnum.RUNNING) return bot;

    const allocations = await this.allocationsOf(bot.id);
    const funded = allocations.filter((a) => Number(a.allocatedAmount) > 0);
    if (funded.length === 0) {
      // Without frozen capital there is no loss budget, so there is no rule
      // that could ever stop the bot. Refuse rather than run unbounded.
      throw new BadRequestException("ARBITRAGE_BOT.ALLOCATION_REQUIRED");
    }
    // One asset with budget left is enough to run: the engine picks the
    // allocation that can fund each opportunity and skips the rest.
    if (!funded.some((a) => this.allocationBudget(a).greaterThan(0))) {
      throw new BadRequestException("ARBITRAGE_BOT.LOSS_BUDGET_EXHAUSTED");
    }

    bot.status = ArbitrageBotStatusEnum.RUNNING;
    bot.startedAt = new Date();
    bot.stoppedAt = null;
    bot.haltedAt = null;
    bot.haltReason = null;
    const saved = await this.botRepo.save(bot);

    await this.recordEvent(saved, {
      type: ArbitrageBotEventTypeEnum.STATUS_CHANGED,
      severity: ArbitrageBotEventSeverityEnum.INFO,
      title: `ربات ${saved.name} شروع به کار کرد`,
      message:
        "ربات با سرمایه فریزشده " +
        funded
          .map((a) => `${a.allocatedAmount} ${a.symbol?.slug ?? ""} (حد ضرر ${a.stopLossAmount})`)
          .join(" و ") +
        " فعال شد.",
    });
    return saved;
  }

  async pause(id: string, actor: BotActor): Promise<ArbitrageBotEntity> {
    const bot = await this.getOwned(id, actor);
    bot.status = ArbitrageBotStatusEnum.PAUSED;
    const saved = await this.botRepo.save(bot);
    await this.recordEvent(saved, {
      type: ArbitrageBotEventTypeEnum.STATUS_CHANGED,
      severity: ArbitrageBotEventSeverityEnum.INFO,
      title: `ربات ${saved.name} موقتاً متوقف شد`,
      message: "سرمایه فریزشده دست‌نخورده باقی می‌ماند تا ربات دوباره فعال شود.",
    });
    return saved;
  }

  /** Stops the bot and unfreezes whatever capital survived its trading. */
  async stop(id: string, actor: BotActor): Promise<ArbitrageBotEntity> {
    const bot = await this.getOwned(id, actor);

    await this.releaseAll(bot, actor.id);

    bot.status = ArbitrageBotStatusEnum.STOPPED;
    bot.stoppedAt = new Date();
    const saved = await this.botRepo.save(bot);

    await this.recordEvent(saved, {
      type: ArbitrageBotEventTypeEnum.STATUS_CHANGED,
      severity: ArbitrageBotEventSeverityEnum.INFO,
      title: `ربات ${saved.name} متوقف شد`,
      message: "سرمایه فریزشده در همه دارایی‌ها به حساب‌های مدیریتی بازگردانده شد.",
    });
    return saved;
  }

  /**
   * Halts a bot by id, re-reading it first. Callers on the signal path hold
   * cached entities whose realized figures may be seconds old, and halting is
   * exactly the moment those figures must be current.
   */
  async haltById(id: string, reason: string): Promise<ArbitrageBotEntity | null> {
    const bot = await this.botRepo.findOne({ where: { id } });
    if (!bot) return null;
    if (bot.status === ArbitrageBotStatusEnum.HALTED) return bot;
    return this.halt(bot, reason);
  }

  /**
   * Stops a bot because its risk rules said so, not because a person did.
   * Capital stays frozen: a halted bot's allocation is the evidence of what
   * it was risking, and releasing it should be a deliberate decision.
   *
   * The caller must pass a freshly loaded bot — saving a stale one would write
   * back stale realized figures.
   */
  async halt(bot: ArbitrageBotEntity, reason: string): Promise<ArbitrageBotEntity> {
    bot.status = ArbitrageBotStatusEnum.HALTED;
    bot.haltedAt = new Date();
    bot.haltReason = reason;
    const saved = await this.botRepo.save(bot);

    await this.recordEvent(saved, {
      type: ArbitrageBotEventTypeEnum.STOP_LOSS_HIT,
      severity: ArbitrageBotEventSeverityEnum.CRITICAL,
      title: `ربات ${saved.name} به حد ضرر رسید`,
      message: reason,
      metadata: {
        allocations: (await this.allocationsOf(saved.id)).map((a) => ({
          symbol: a.symbol?.slug ?? a.symbolId,
          allocatedAmount: Number(a.allocatedAmount),
          stopLossAmount: Number(a.stopLossAmount),
          realizedLoss: Number(a.realizedLoss),
        })),
      },
    });
    return saved;
  }

  // ── Reads used by the engine and the panel ───────────────────────────────

  /** Bots currently evaluating signals. */
  async listRunning(): Promise<ArbitrageBotEntity[]> {
    return this.botRepo.find({
      where: { status: ArbitrageBotStatusEnum.RUNNING },
      relations: { allocations: { symbol: true } },
    });
  }

  // ── Section KPIs ─────────────────────────────────────────────────────────

  /**
   * A management view of the whole arbitrage section.
   *
   * Money is reported in Rial, and where it can be it comes from the trades
   * themselves (`realizedProfitRial` was written at settlement, at the rates
   * that actually applied) rather than from re-valuing today. Only the frozen
   * capital has to be valued live, because it is a holding, not a past event;
   * assets with no usable rate are reported separately instead of being
   * silently counted as zero.
   */
  async summary(): Promise<ArbitrageBotSummary> {
    const bots = await this.botRepo.find({ relations: { allocations: { symbol: true } } });
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 3600_000);

    const byStatus = (status: ArbitrageBotStatusEnum) =>
      bots.filter((bot) => bot.status === status).length;

    // Allocations are per-asset; group first, then value each asset once.
    const perAsset = new Map<string, { symbolId: string; symbol: string; amount: Decimal }>();
    for (const allocation of bots.flatMap((bot) => bot.allocations ?? [])) {
      const amount = new Decimal(allocation.allocatedAmount ?? 0);
      if (amount.lessThanOrEqualTo(0)) continue;
      const row = perAsset.get(allocation.symbolId) ?? {
        symbolId: allocation.symbolId,
        symbol: allocation.symbol?.slug ?? allocation.symbol?.name ?? allocation.symbolId,
        amount: new Decimal(0),
      };
      row.amount = row.amount.plus(amount);
      perAsset.set(allocation.symbolId, row);
    }

    const rialId = await this.rialSymbolId();
    let allocatedRial = new Decimal(0);
    const unpricedAssets: string[] = [];
    const allocations: ArbitrageBotSummary["allocations"] = [];

    for (const row of perAsset.values()) {
      let rial: number | null = null;
      if (rialId && row.symbolId === rialId) {
        rial = row.amount.toNumber();
      } else if (rialId) {
        const rate = await this.valuation.getRate(
          row.symbolId,
          rialId,
          ValuationBasisEnum.BID,
          DEFAULT_BOT_THRESHOLDS.maxQuoteAgeSeconds
        );
        if (rate.rate !== null) rial = row.amount.times(rate.rate).toNumber();
      }
      if (rial === null) unpricedAssets.push(row.symbol);
      else allocatedRial = allocatedRial.plus(rial);
      allocations.push({ symbol: row.symbol, amount: row.amount.toNumber(), valueRial: rial });
    }

    const [openTrades, tradesLastDay, settledLastDay] = await Promise.all([
      this.tradeRepo.count({
        where: {
          status: In([ArbitrageBotTradeStatusEnum.PLANNED, ArbitrageBotTradeStatusEnum.SUBMITTED]),
        },
      }),
      this.tradeRepo.count({ where: { createAt: MoreThan(dayAgo) } }),
      this.tradeRepo.find({
        where: { settledAt: MoreThan(dayAgo) },
        select: { status: true, realizedProfitRial: true },
      }),
    ]);

    const filledLastDay = settledLastDay.filter(
      (trade) => trade.status === ArbitrageBotTradeStatusEnum.FILLED
    ).length;
    const profitLastDayRial = settledLastDay.reduce(
      (sum, trade) => sum.plus(trade.realizedProfitRial ?? 0),
      new Decimal(0)
    );

    const totalProfitRial = await this.tradeRepo
      .createQueryBuilder("trade")
      .select("COALESCE(SUM(trade.realized_profit_rial), 0)", "sum")
      .getRawOne<{ sum: string }>();

    const sum = (pick: (bot: ArbitrageBotEntity) => number) =>
      bots.reduce((total, bot) => total.plus(pick(bot) ?? 0), new Decimal(0)).toNumber();

    // Loss budgets live in different assets, so they are counted rather than
    // summed: one number over gold and Rial would mean nothing.
    const runningAllocations = bots
      .filter((bot) => bot.status === ArbitrageBotStatusEnum.RUNNING)
      .flatMap((bot) => bot.allocations ?? []);
    const fundedAssets = new Set(
      runningAllocations
        .filter((a) => Number(a.allocatedAmount) > 0)
        .map((a) => a.symbol?.slug ?? a.symbolId)
    );
    const exhaustedAssets = runningAllocations.filter(
      (a) => Number(a.allocatedAmount) > 0 && this.allocationBudget(a).lessThanOrEqualTo(0)
    ).length;

    return {
      totalBots: bots.length,
      running: byStatus(ArbitrageBotStatusEnum.RUNNING),
      paused: byStatus(ArbitrageBotStatusEnum.PAUSED),
      halted: byStatus(ArbitrageBotStatusEnum.HALTED),
      stopped: byStatus(ArbitrageBotStatusEnum.STOPPED),
      draft: byStatus(ArbitrageBotStatusEnum.DRAFT),
      autoExecuting: bots.filter(
        (bot) =>
          bot.executionMode === ArbitrageBotExecutionModeEnum.AUTO &&
          bot.status === ArbitrageBotStatusEnum.RUNNING
      ).length,
      allocatedRial: allocatedRial.toNumber(),
      allocations,
      unpricedAssets,
      fundedAssets: fundedAssets.size,
      exhaustedAllocations: exhaustedAssets,
      matchedSignals: sum((bot) => bot.matchedSignals),
      totalTrades: sum((bot) => bot.totalTrades),
      // Two provider orders per cycle: this is the number the providers saw.
      totalTransactions: sum((bot) => bot.totalTransactions ?? 0),
      openTrades,
      tradesLastDay,
      transactionsLastDay: tradesLastDay * 2,
      settledLastDay: settledLastDay.length,
      filledLastDay,
      failedLastDay: settledLastDay.length - filledLastDay,
      fillRateLastDay:
        settledLastDay.length > 0 ? (filledLastDay / settledLastDay.length) * 100 : null,
      profitLastDayRial: profitLastDayRial.toNumber(),
      totalProfitRial: Number(totalProfitRial?.sum ?? 0),
      lastSignalAt:
        bots
          .map((bot) => bot.lastSignalAt)
          .filter((at): at is Date => !!at)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    };
  }

  /** The Rial symbol, cached: every money KPI is expressed against it. */
  private async rialSymbolId(): Promise<string | null> {
    if (this.rialId !== undefined) return this.rialId;
    const symbol = await this.symbolRepo.findOne({
      where: { symbolType: SymbolTypeEnum.RIAL },
      order: { createAt: "ASC" },
    });
    this.rialId = symbol?.id ?? null;
    return this.rialId;
  }

  async getTrades(botId: string, limit = 50, offset = 0) {
    const take = Math.min(limit, 200);
    const [items, total] = await this.tradeRepo.findAndCount({
      where: { botId },
      order: { createAt: "DESC" },
      take,
      skip: offset,
    });
    return paginate(items, total, { currentPage: pageOf(offset, take), take });
  }

  async getEvents(botId: string, limit = 50, offset = 0) {
    const take = Math.min(limit, 200);
    const [items, total] = await this.eventRepo.findAndCount({
      where: { botId },
      order: { createAt: "DESC" },
      take,
      skip: offset,
    });
    return paginate(items, total, { currentPage: pageOf(offset, take), take });
  }

  /** How many open trades a bot currently has, for its concurrency cap. */
  async countOpenTrades(botId: string): Promise<number> {
    return this.tradeRepo.count({
      where: {
        botId,
        status: In([ArbitrageBotTradeStatusEnum.PLANNED, ArbitrageBotTradeStatusEnum.SUBMITTED]),
      },
    });
  }

  /** Trades started in the last hour, for the per-hour rate cap. */
  async countTradesSince(botId: string, since: Date): Promise<number> {
    return this.tradeRepo
      .createQueryBuilder("t")
      .where("t.bot_id = :botId", { botId })
      .andWhere("t.created_at >= :since", { since })
      .getCount();
  }

  /** Loss the bot may still absorb before its stop-loss halts it. */
  /** What one allocation may still lose before the bot stops using that asset. */
  allocationBudget(allocation: ArbitrageBotAllocationEntity): Decimal {
    return new Decimal(allocation.stopLossAmount).minus(allocation.realizedLoss);
  }

  /**
   * Records an event and hands it to the notifier, which decides — from the
   * bot's own notification config — whether and where it goes out.
   */
  async recordEvent(
    bot: ArbitrageBotEntity,
    event: {
      type: ArbitrageBotEventTypeEnum;
      severity: ArbitrageBotEventSeverityEnum;
      title: string;
      message: string;
      metadata?: Record<string, any>;
      tradeId?: string;
    }
  ): Promise<ArbitrageBotEventEntity> {
    const row = await this.eventRepo.save(
      this.eventRepo.create({
        botId: bot.id,
        type: event.type,
        severity: event.severity,
        title: event.title,
        message: event.message,
        metadata: event.metadata ?? null,
        tradeId: event.tradeId ?? null,
        notifiedChannels: [],
      })
    );

    try {
      const channels = await this.notifier.dispatch(bot, row);
      if (channels.length > 0) {
        row.notifiedChannels = channels;
        await this.eventRepo.save(row);
      }
    } catch (err) {
      // A failed alert must not roll back the event it was describing; the
      // record with an empty channel list is itself the evidence it failed.
      this.logger.error(`bot ${bot.id} notification failed: ${(err as Error).message}`);
    }

    return row;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * Loads a bot the actor is allowed to change. Ownership is enforced here
   * rather than only at the route, because a bot's allocation is real money
   * belonging to one specific manager.
   */
  async getOwned(id: string, actor: BotActor): Promise<ArbitrageBotEntity> {
    const bot = await this.botRepo.findOne({
      where: { id },
      relations: { allocations: { symbol: true }, ownerAdmin: true },
    });
    if (!bot) throw new NotFoundException("ARBITRAGE_BOT.NOT_FOUND");
    if (bot.ownerAdminId !== actor.id && actor.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException("ARBITRAGE_BOT.NOT_OWNER");
    }
    return bot;
  }

  private mergeScope(current: ArbitrageBotScope, patch?: Partial<ArbitrageBotScope>): ArbitrageBotScope {
    return {
      pricePairIds: patch?.pricePairIds ?? current.pricePairIds ?? [],
      marketTypes: patch?.marketTypes ?? current.marketTypes ?? [],
      providerKeys: patch?.providerKeys ?? current.providerKeys ?? [],
      itemIds: patch?.itemIds ?? current.itemIds ?? [],
    };
  }

  private mergeThresholds(
    current: ArbitrageBotThresholds,
    patch?: Partial<ArbitrageBotThresholds>
  ): ArbitrageBotThresholds {
    return { ...DEFAULT_BOT_THRESHOLDS, ...current, ...(patch ?? {}) };
  }

  private mergeNotifications(
    current: ArbitrageBotNotificationConfig,
    patch?: Partial<ArbitrageBotNotificationConfig>
  ): ArbitrageBotNotificationConfig {
    return { ...DEFAULT_BOT_NOTIFICATIONS, ...current, ...(patch ?? {}) };
  }

  /**
   * The shape the panel reads.
   *
   * Frozen capital is a list, not a number: a bot funded with gold and Rial
   * holds two different things, and adding them together would be nonsense.
   * The rolled-up `lossBudgetUsedPercent` is the worst allocation rather than
   * an average, because the binding constraint is the asset closest to its
   * stop-loss, not the healthy one beside it.
   */
  private present(bot: ArbitrageBotEntity) {
    const allocations = (bot.allocations ?? []).map((allocation) => {
      const allocated = Number(allocation.allocatedAmount) || 0;
      const stopLoss = Number(allocation.stopLossAmount) || 0;
      const realizedLoss = Number(allocation.realizedLoss) || 0;
      return {
        id: allocation.id,
        symbolId: allocation.symbolId,
        symbol: allocation.symbol
          ? { id: allocation.symbol.id, name: allocation.symbol.name, slug: allocation.symbol.slug }
          : null,
        managerAccountId: allocation.managerAccountId,
        allocatedAmount: allocated,
        stopLossPercent: Number(allocation.stopLossPercent) || 0,
        stopLossAmount: stopLoss,
        realizedPnl: Number(allocation.realizedPnl) || 0,
        realizedLoss,
        lossBudgetRemaining: Math.max(0, stopLoss - realizedLoss),
        lossBudgetUsedPercent: stopLoss > 0 ? Math.min(100, (realizedLoss / stopLoss) * 100) : 0,
      };
    });

    const funded = allocations.filter((a) => a.allocatedAmount > 0);

    return {
      id: bot.id,
      name: bot.name,
      description: bot.description,
      status: bot.status,
      executionMode: bot.executionMode,
      ownerAdminId: bot.ownerAdminId,
      owner: bot.ownerAdmin
        ? { id: bot.ownerAdmin.id, phone: bot.ownerAdmin.phone, email: bot.ownerAdmin.email }
        : null,
      scope: bot.scope ?? DEFAULT_BOT_SCOPE,
      thresholds: bot.thresholds ?? DEFAULT_BOT_THRESHOLDS,
      notifications: bot.notifications ?? DEFAULT_BOT_NOTIFICATIONS,
      allocations,
      stopLossPercent: Number(bot.stopLossPercent) || 0,
      lossBudgetUsedPercent: funded.length
        ? Math.max(...funded.map((a) => a.lossBudgetUsedPercent))
        : 0,
      startedAt: bot.startedAt,
      stoppedAt: bot.stoppedAt,
      haltedAt: bot.haltedAt,
      haltReason: bot.haltReason,
      lastSignalAt: bot.lastSignalAt,
      lastTradeAt: bot.lastTradeAt,
      matchedSignals: bot.matchedSignals,
      totalTrades: bot.totalTrades,
      totalTransactions: bot.totalTransactions ?? 0,
      createdAt: bot.createAt,
      updatedAt: bot.updateAt,
    };
  }
}
