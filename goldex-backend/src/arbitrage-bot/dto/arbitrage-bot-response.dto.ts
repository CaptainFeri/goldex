import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArbitrageBotEventSeverityEnum,
  ArbitrageBotEventTypeEnum,
  ArbitrageBotExecutionModeEnum,
  ArbitrageBotNotifyChannelEnum,
  ArbitrageBotStatusEnum,
  ArbitrageBotTradeStatusEnum,
} from "../enum/arbitrage-bot.enums";

export class BotOwnerRefDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({ nullable: true })
  phone?: string;

  @ApiPropertyOptional({ nullable: true })
  email?: string;
}

export class BotSymbolRefDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: "XAU" })
  slug: string;
}

/** Which opportunities the bot is interested in; an empty list means "any". */
export class BotScopeDto {
  @ApiProperty({ type: [String], format: "uuid" })
  pricePairIds: string[];

  @ApiProperty({ type: [String], example: ["formal"] })
  marketTypes: string[];

  @ApiProperty({ type: [String] })
  providerKeys: string[];

  @ApiProperty({ type: [Number] })
  itemIds: number[];
}

export class BotThresholdsDto {
  @ApiProperty()
  minProfitRial: number;

  @ApiProperty()
  minProfitPercent: number;

  @ApiProperty({ description: "In the traded item's own unit; 0 = only the loss budget limits it" })
  maxTradeVolume: number;

  @ApiProperty()
  maxOpenTrades: number;

  @ApiProperty()
  maxTradesPerHour: number;

  @ApiProperty()
  cooldownSeconds: number;

  @ApiProperty()
  maxQuoteAgeSeconds: number;
}

export class BotNotificationsDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ enum: ArbitrageBotNotifyChannelEnum, isArray: true })
  channels: ArbitrageBotNotifyChannelEnum[];

  @ApiProperty({ enum: ArbitrageBotEventTypeEnum, isArray: true })
  events: ArbitrageBotEventTypeEnum[];

  @ApiProperty({ description: "Warn once this share of the stop-loss budget is spent" })
  lossWarningPercent: number;

  @ApiProperty()
  minProfitToNotifyRial: number;

  @ApiProperty()
  throttleSeconds: number;

  @ApiProperty({ nullable: true })
  telegramChatId?: string | null;

  @ApiProperty({ nullable: true })
  smsPhone?: string | null;
}

export class ArbitrageBotDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ enum: ArbitrageBotStatusEnum })
  status: ArbitrageBotStatusEnum;

  @ApiProperty({ enum: ArbitrageBotExecutionModeEnum })
  executionMode: ArbitrageBotExecutionModeEnum;

  @ApiProperty({ format: "uuid" })
  ownerAdminId: string;

  @ApiProperty({ type: BotOwnerRefDto, nullable: true })
  owner: BotOwnerRefDto | null;

  @ApiProperty({ type: BotScopeDto })
  scope: BotScopeDto;

  @ApiProperty({ type: BotThresholdsDto })
  thresholds: BotThresholdsDto;

  @ApiProperty({ type: BotNotificationsDto })
  notifications: BotNotificationsDto;

  @ApiProperty({ format: "uuid", nullable: true })
  managerAccountId: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  symbolId: string | null;

  @ApiProperty({ type: BotSymbolRefDto, nullable: true })
  symbol: BotSymbolRefDto | null;

  @ApiProperty({ description: "Capital frozen out of the owner's manager account" })
  allocatedAmount: number;

  @ApiProperty()
  stopLossPercent: number;

  @ApiProperty({ description: "The loss budget, in the allocation's asset" })
  stopLossAmount: number;

  @ApiProperty()
  realizedPnl: number;

  @ApiProperty({ description: "Cumulative realized losses — what the stop-loss measures" })
  realizedLoss: number;

  @ApiProperty()
  lossBudgetRemaining: number;

  @ApiProperty()
  lossBudgetUsedPercent: number;

  @ApiProperty({ format: "date-time", nullable: true })
  startedAt: Date | null;

  @ApiProperty({ format: "date-time", nullable: true })
  stoppedAt: Date | null;

  @ApiProperty({ format: "date-time", nullable: true })
  haltedAt: Date | null;

  @ApiProperty({ nullable: true, description: "Why the risk rules stopped it" })
  haltReason: string | null;

  @ApiProperty({ format: "date-time", nullable: true })
  lastSignalAt: Date | null;

  @ApiProperty({ format: "date-time", nullable: true })
  lastTradeAt: Date | null;

  @ApiProperty()
  matchedSignals: number;

  @ApiProperty()
  totalTrades: number;

  @ApiProperty({ format: "date-time", nullable: true })
  createdAt: Date | null;

  @ApiProperty({ format: "date-time", nullable: true })
  updatedAt: Date | null;
}

export class ArbitrageBotTradeDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  botId: string;

  @ApiProperty({ description: "The engine's stable key for the opportunity" })
  signalKey: string;

  @ApiProperty({ nullable: true })
  signalId: string | null;

  @ApiProperty({ nullable: true })
  itemId: number | null;

  @ApiProperty({ nullable: true })
  itemName: string | null;

  @ApiProperty()
  buyProviderKey: string;

  @ApiProperty()
  sellProviderKey: string;

  @ApiProperty({ description: "Rial price the bot buys at" })
  buyPrice: number;

  @ApiProperty({ description: "Rial price the bot sells at" })
  sellPrice: number;

  @ApiProperty({ description: "Position size in the traded item's own unit" })
  volume: number;

  @ApiProperty()
  expectedProfitRial: number;

  @ApiProperty({ nullable: true, description: "Null until the trade settles" })
  realizedProfitRial: number | null;

  @ApiProperty({ nullable: true, description: "The same result in the allocation's asset" })
  realizedPnlAsset: number | null;

  @ApiProperty({ enum: ArbitrageBotTradeStatusEnum })
  status: ArbitrageBotTradeStatusEnum;

  @ApiProperty({ type: Object, nullable: true, description: "Per-leg execution state" })
  legs: Record<string, any> | null;

  @ApiProperty({ format: "date-time", nullable: true })
  submittedAt: Date | null;

  @ApiProperty({ format: "date-time", nullable: true })
  settledAt: Date | null;

  @ApiProperty({ nullable: true })
  failureReason: string | null;
}

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

  @ApiProperty({ type: Object, nullable: true })
  metadata: Record<string, any> | null;

  @ApiProperty({
    type: [String],
    description: "Channels the alert went out on; empty when it was not notified",
  })
  notifiedChannels: string[];

  @ApiProperty({ format: "uuid", nullable: true })
  tradeId: string | null;
}
