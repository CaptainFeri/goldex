import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import Decimal from "decimal.js";
import { ArbitrageBotEntity } from "./entity/arbitrage-bot.entity";
import { ArbitrageBotTradeEntity } from "./entity/arbitrage-bot-trade.entity";
import { ArbitrageBotEventEntity } from "./entity/arbitrage-bot-event.entity";
import {
  ArbitrageBotEventSeverityEnum,
  ArbitrageBotEventTypeEnum,
  ArbitrageBotExecutionModeEnum,
  ArbitrageBotStatusEnum,
  ArbitrageBotTradeStatusEnum,
} from "./enum/arbitrage-bot.enums";
import {
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
import { ManagerAccountService } from "../manager-account/manager-account.service";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { ArbitrageBotNotifierService } from "./arbitrage-bot-notifier.service";

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

  constructor(
    @InjectRepository(ArbitrageBotEntity)
    private readonly botRepo: Repository<ArbitrageBotEntity>,
    @InjectRepository(ArbitrageBotTradeEntity)
    private readonly tradeRepo: Repository<ArbitrageBotTradeEntity>,
    @InjectRepository(ArbitrageBotEventEntity)
    private readonly eventRepo: Repository<ArbitrageBotEventEntity>,
    private readonly managerAccounts: ManagerAccountService,
    private readonly notifier: ArbitrageBotNotifierService,
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
      allocatedAmount: 0,
      stopLossAmount: 0,
    });

    const saved = await this.botRepo.save(bot);

    // Funding at creation time is the normal flow — the manager decides how
    // much of their account this bot may risk as they define it.
    if (dto.symbolId && dto.allocatedAmount) {
      return this.allocate(
        saved.id,
        { symbolId: dto.symbolId, amount: dto.allocatedAmount, stopLossPercent: dto.stopLossPercent },
        actor
      );
    }
    return saved;
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
      bot.stopLossPercent = dto.stopLossPercent;
      bot.stopLossAmount = new Decimal(bot.allocatedAmount)
        .times(dto.stopLossPercent)
        .dividedBy(100)
        .toNumber();
    }

    return this.botRepo.save(bot);
  }

  async list(filters: { ownerAdminId?: string; status?: ArbitrageBotStatusEnum } = {}) {
    const bots = await this.botRepo.find({
      where: {
        ...(filters.ownerAdminId ? { ownerAdminId: filters.ownerAdminId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      relations: { symbol: true, ownerAdmin: true },
      order: { createAt: "DESC" },
    });
    return bots.map((b) => this.present(b));
  }

  async get(id: string) {
    const bot = await this.botRepo.findOne({
      where: { id },
      relations: { symbol: true, ownerAdmin: true, managerAccount: true },
    });
    if (!bot) throw new NotFoundException("ARBITRAGE_BOT.NOT_FOUND");
    return this.present(bot);
  }

  async remove(id: string, actor: BotActor): Promise<void> {
    const bot = await this.getOwned(id, actor);
    if (bot.status === ArbitrageBotStatusEnum.RUNNING) {
      throw new BadRequestException("ARBITRAGE_BOT.STOP_BEFORE_DELETE");
    }
    // Deleting must never strand frozen capital in a bot nobody can see.
    if (Number(bot.allocatedAmount) > 0 && bot.managerAccountId) {
      await this.managerAccounts.releaseFromBot(
        bot.managerAccountId,
        bot.id,
        bot.allocatedAmount,
        actor.id
      );
    }
    await this.botRepo.softRemove(bot);
  }

  // ── Capital ──────────────────────────────────────────────────────────────

  /**
   * Freezes capital from the owner's manager account into this bot. The bot's
   * loss budget is recomputed from the new total, so raising an allocation
   * also raises the line at which the bot halts.
   */
  async allocate(id: string, dto: AllocateCapitalDto, actor: BotActor): Promise<ArbitrageBotEntity> {
    const bot = await this.getOwned(id, actor);

    if (bot.symbolId && bot.symbolId !== dto.symbolId) {
      throw new BadRequestException("ARBITRAGE_BOT.SYMBOL_MISMATCH");
    }

    const account = await this.managerAccounts.getOrCreateAccount(bot.ownerAdminId, dto.symbolId);
    if (bot.managerAccountId && bot.managerAccountId !== account.id) {
      throw new BadRequestException("ARBITRAGE_BOT.ACCOUNT_MISMATCH");
    }

    await this.managerAccounts.allocateToBot(account.id, bot.id, dto.amount, actor.id);

    bot.managerAccountId = account.id;
    bot.symbolId = dto.symbolId;
    bot.allocatedAmount = new Decimal(bot.allocatedAmount).plus(dto.amount).toNumber();
    if (dto.stopLossPercent !== undefined) bot.stopLossPercent = dto.stopLossPercent;
    bot.stopLossAmount = new Decimal(bot.allocatedAmount)
      .times(bot.stopLossPercent)
      .dividedBy(100)
      .toNumber();

    return this.botRepo.save(bot);
  }

  /**
   * Returns frozen capital to the manager account. A running bot keeps at
   * least the capital its stop-loss budget is measured against, so releasing
   * everything requires stopping it first.
   */
  async release(id: string, dto: ReleaseCapitalDto, actor: BotActor): Promise<ArbitrageBotEntity> {
    const bot = await this.getOwned(id, actor);
    if (!bot.managerAccountId) throw new BadRequestException("ARBITRAGE_BOT.NOT_FUNDED");

    const allocated = new Decimal(bot.allocatedAmount);
    const requested = dto.amount === undefined ? allocated : new Decimal(dto.amount);
    if (requested.greaterThan(allocated)) {
      throw new BadRequestException("ARBITRAGE_BOT.RELEASE_EXCEEDS_ALLOCATION");
    }
    if (bot.status === ArbitrageBotStatusEnum.RUNNING && requested.equals(allocated)) {
      throw new BadRequestException("ARBITRAGE_BOT.STOP_BEFORE_FULL_RELEASE");
    }

    await this.managerAccounts.releaseFromBot(
      bot.managerAccountId,
      bot.id,
      requested.toNumber(),
      actor.id
    );

    bot.allocatedAmount = allocated.minus(requested).toNumber();
    bot.stopLossAmount = new Decimal(bot.allocatedAmount)
      .times(bot.stopLossPercent)
      .dividedBy(100)
      .toNumber();

    return this.botRepo.save(bot);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async start(id: string, actor: BotActor): Promise<ArbitrageBotEntity> {
    const bot = await this.getOwned(id, actor);

    if (bot.status === ArbitrageBotStatusEnum.RUNNING) return bot;
    if (!bot.managerAccountId || !(Number(bot.allocatedAmount) > 0)) {
      // Without frozen capital there is no loss budget, so there is no rule
      // that could ever stop the bot. Refuse rather than run unbounded.
      throw new BadRequestException("ARBITRAGE_BOT.ALLOCATION_REQUIRED");
    }
    if (this.lossBudgetRemaining(bot).lessThanOrEqualTo(0)) {
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
      message: `ربات با سرمایه فریزشده ${saved.allocatedAmount} و حد ضرر ${saved.stopLossAmount} فعال شد.`,
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

    if (bot.managerAccountId && Number(bot.allocatedAmount) > 0) {
      await this.managerAccounts.releaseFromBot(
        bot.managerAccountId,
        bot.id,
        bot.allocatedAmount,
        actor.id
      );
      bot.allocatedAmount = 0;
      bot.stopLossAmount = 0;
    }

    bot.status = ArbitrageBotStatusEnum.STOPPED;
    bot.stoppedAt = new Date();
    const saved = await this.botRepo.save(bot);

    await this.recordEvent(saved, {
      type: ArbitrageBotEventTypeEnum.STATUS_CHANGED,
      severity: ArbitrageBotEventSeverityEnum.INFO,
      title: `ربات ${saved.name} متوقف شد`,
      message: "سرمایه فریزشده به حساب مدیریتی بازگردانده شد.",
    });
    return saved;
  }

  /**
   * Stops a bot because its risk rules said so, not because a person did.
   * Capital stays frozen: a halted bot's allocation is the evidence of what
   * it was risking, and releasing it should be a deliberate decision.
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
        realizedLoss: Number(saved.realizedLoss),
        stopLossAmount: Number(saved.stopLossAmount),
        allocatedAmount: Number(saved.allocatedAmount),
      },
    });
    return saved;
  }

  // ── Reads used by the engine and the panel ───────────────────────────────

  /** Bots currently evaluating signals. */
  async listRunning(): Promise<ArbitrageBotEntity[]> {
    return this.botRepo.find({
      where: { status: ArbitrageBotStatusEnum.RUNNING },
      relations: { symbol: true },
    });
  }

  async getTrades(botId: string, limit = 50, offset = 0) {
    const [items, total] = await this.tradeRepo.findAndCount({
      where: { botId },
      order: { createAt: "DESC" },
      take: Math.min(limit, 200),
      skip: offset,
    });
    return { items, total };
  }

  async getEvents(botId: string, limit = 50, offset = 0) {
    const [items, total] = await this.eventRepo.findAndCount({
      where: { botId },
      order: { createAt: "DESC" },
      take: Math.min(limit, 200),
      skip: offset,
    });
    return { items, total };
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
  lossBudgetRemaining(bot: ArbitrageBotEntity): Decimal {
    return new Decimal(bot.stopLossAmount).minus(bot.realizedLoss);
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
    const bot = await this.botRepo.findOne({ where: { id } });
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

  private present(bot: ArbitrageBotEntity) {
    const allocated = Number(bot.allocatedAmount) || 0;
    const stopLoss = Number(bot.stopLossAmount) || 0;
    const realizedLoss = Number(bot.realizedLoss) || 0;
    const remaining = Math.max(0, stopLoss - realizedLoss);

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
      managerAccountId: bot.managerAccountId,
      symbolId: bot.symbolId,
      symbol: bot.symbol ? { id: bot.symbol.id, name: bot.symbol.name, slug: bot.symbol.slug } : null,
      allocatedAmount: allocated,
      stopLossPercent: Number(bot.stopLossPercent) || 0,
      stopLossAmount: stopLoss,
      realizedPnl: Number(bot.realizedPnl) || 0,
      realizedLoss,
      lossBudgetRemaining: remaining,
      lossBudgetUsedPercent: stopLoss > 0 ? Math.min(100, (realizedLoss / stopLoss) * 100) : 0,
      startedAt: bot.startedAt,
      stoppedAt: bot.stoppedAt,
      haltedAt: bot.haltedAt,
      haltReason: bot.haltReason,
      lastSignalAt: bot.lastSignalAt,
      lastTradeAt: bot.lastTradeAt,
      matchedSignals: bot.matchedSignals,
      totalTrades: bot.totalTrades,
      createdAt: bot.createAt,
      updatedAt: bot.updateAt,
    };
  }
}
