import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArbitrageBotEventSeverityEnum,
  ArbitrageBotEventTypeEnum,
  ArbitrageBotExecutionModeEnum,
  ArbitrageBotNotifyChannelEnum,
  ArbitrageBotStatusEnum,
  ArbitrageBotTradeStatusEnum,
} from "../enum/arbitrage-bot.enums";

/** Which opportunities a bot acts on. Every empty list means "no restriction". */
export class ArbitrageBotScopeDto {
  @ApiProperty({ type: [String], format: "uuid" })
  pricePairIds: string[];

  @ApiProperty({ type: [String], example: ["formal"] })
  marketTypes: string[];

  @ApiProperty({ type: [String], example: ["mock-zaryar-b"] })
  providerKeys: string[];

  @ApiProperty({ type: [Number], example: [101] })
  itemIds: number[];
}

/** The conditions an opportunity must clear before the bot acts on it. */
export class ArbitrageBotThresholdsDto {
  @ApiProperty({ description: "Absolute profit floor for one trade, in Rial" })
  minProfitRial: number;

  @ApiProperty({ description: "Percentage profit floor for one trade" })
  minProfitPercent: number;

  @ApiProperty({ description: "Largest position opened at once, in the item's own unit" })
  maxTradeVolume: number;

  @ApiProperty({ description: "Submitted-but-unsettled trades allowed at once" })
  maxOpenTrades: number;

  @ApiProperty({ description: "Cap on new trades in any rolling hour" })
  maxTradesPerHour: number;

  @ApiProperty({ description: "Quiet period after a trade before the bot may act again" })
  cooldownSeconds: number;

  @ApiProperty({ description: "Refuse a signal whose quotes are older than this" })
  maxQuoteAgeSeconds: number;
}

/** Per-bot notification policy. */
export class ArbitrageBotNotificationsDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ enum: ArbitrageBotNotifyChannelEnum, isArray: true })
  channels: ArbitrageBotNotifyChannelEnum[];

  @ApiProperty({ enum: ArbitrageBotEventTypeEnum, isArray: true })
  events: ArbitrageBotEventTypeEnum[];

  @ApiProperty({ description: "Warn once this share of the stop-loss budget is used" })
  lossWarningPercent: number;

  @ApiProperty({ description: "Do not notify about matched signals smaller than this (Rial)" })
  minProfitToNotifyRial: number;

  @ApiProperty({ description: "Minimum gap between notifications of the same event type" })
  throttleSeconds: number;

  @ApiPropertyOptional({ nullable: true })
  telegramChatId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  smsPhone?: string | null;
}

/** The admin who owns a bot. */
export class ArbitrageBotOwnerDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  email?: string | null;
}

/** The asset a bot's allocation is denominated in. */
export class ArbitrageBotSymbolDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: "IRR" })
  slug: string;
}

/**
 * An arbitrage bot: what it watches, what it may risk, and how much of its
 * loss budget it has already spent.
 */
export class ArbitrageBotDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiProperty({ enum: ArbitrageBotStatusEnum })
  status: ArbitrageBotStatusEnum;

  @ApiProperty({ enum: ArbitrageBotExecutionModeEnum })
  executionMode: ArbitrageBotExecutionModeEnum;

  @ApiProperty({ format: "uuid" })
  ownerAdminId: string;

  @ApiPropertyOptional({ type: ArbitrageBotOwnerDto, nullable: true })
  owner?: ArbitrageBotOwnerDto | null;

  @ApiProperty({ type: ArbitrageBotScopeDto })
  scope: ArbitrageBotScopeDto;

  @ApiProperty({ type: ArbitrageBotThresholdsDto })
  thresholds: ArbitrageBotThresholdsDto;

  @ApiProperty({ type: ArbitrageBotNotificationsDto })
  notifications: ArbitrageBotNotificationsDto;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  managerAccountId?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  symbolId?: string | null;

  @ApiPropertyOptional({ type: ArbitrageBotSymbolDto, nullable: true })
  symbol?: ArbitrageBotSymbolDto | null;

  @ApiProperty({ description: "Capital frozen from the manager account into this bot" })
  allocatedAmount: number;

  @ApiProperty()
  stopLossPercent: number;

  @ApiProperty({ description: "The loss budget, derived from the allocation" })
  stopLossAmount: number;

  @ApiProperty()
  realizedPnl: number;

  @ApiProperty()
  realizedLoss: number;

  @ApiProperty({ description: "stopLossAmount − realizedLoss, floored at zero" })
  lossBudgetRemaining: number;

  @ApiProperty({ description: "Share of the loss budget already spent (0–100)" })
  lossBudgetUsedPercent: number;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  startedAt?: Date | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  stoppedAt?: Date | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  haltedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true, description: "Why the risk rules halted the bot" })
  haltReason?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  lastSignalAt?: Date | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  lastTradeAt?: Date | null;

  @ApiProperty()
  matchedSignals: number;

  @ApiProperty()
  totalTrades: number;

  @ApiProperty({ format: "date-time" })
  createdAt: Date;

  @ApiProperty({ format: "date-time" })
  updatedAt: Date;
}

/** One opportunity a bot acted on, from sizing through settlement. */
export class ArbitrageBotTradeDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  botId: string;

  @ApiProperty({ description: "The opportunity's stable key, for de-duplication" })
  signalKey: string;

  @ApiPropertyOptional({ nullable: true })
  signalId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  itemId?: number | null;

  @ApiPropertyOptional({ nullable: true })
  itemName?: string | null;

  @ApiProperty()
  buyProviderKey: string;

  @ApiProperty()
  sellProviderKey: string;

  @ApiProperty()
  buyPrice: number;

  @ApiProperty()
  sellPrice: number;

  @ApiProperty()
  volume: number;

  @ApiProperty()
  expectedProfitRial: number;

  @ApiPropertyOptional({ nullable: true })
  realizedProfitRial?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "P&L in the allocation's own asset" })
  realizedPnlAsset?: number | null;

  @ApiProperty({ enum: ArbitrageBotTradeStatusEnum })
  status: ArbitrageBotTradeStatusEnum;

  @ApiPropertyOptional({ type: Object, nullable: true, description: "Both provider legs" })
  legs?: Record<string, any> | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  submittedAt?: Date | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  settledAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  failureReason?: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true, description: "The signal as matched" })
  signal?: Record<string, any> | null;

  @ApiProperty({ format: "date-time" })
  createAt: Date;
}

/** An entry in a bot's own log, including which alerts went out. */
export class ArbitrageBotEventDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  botId: string;

  @ApiProperty({ enum: ArbitrageBotEventTypeEnum })
  type: ArbitrageBotEventTypeEnum;

  @ApiProperty({ enum: ArbitrageBotEventSeverityEnum })
  severity: ArbitrageBotEventSeverityEnum;

  @ApiProperty()
  title: string;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  metadata?: Record<string, any> | null;

  @ApiProperty({ enum: ArbitrageBotNotifyChannelEnum, isArray: true })
  notifiedChannels: ArbitrageBotNotifyChannelEnum[];

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  tradeId?: string | null;

  @ApiProperty({ format: "date-time" })
  createAt: Date;
}

/** A page of trades, newest first, with the unpaged total. */
export class ArbitrageBotTradePageDto {
  @ApiProperty({ type: [ArbitrageBotTradeDto] })
  items: ArbitrageBotTradeDto[];

  @ApiProperty()
  total: number;
}

/** A page of log entries, newest first, with the unpaged total. */
export class ArbitrageBotEventPageDto {
  @ApiProperty({ type: [ArbitrageBotEventDto] })
  items: ArbitrageBotEventDto[];

  @ApiProperty()
  total: number;
}

/** The acknowledgement returned when a bot is deleted. */
export class ArbitrageBotDeletedDto {
  @ApiProperty({ example: true })
  deleted: boolean;
}
