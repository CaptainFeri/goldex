import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  ArbitrageBotEventTypeEnum,
  ArbitrageBotExecutionModeEnum,
  ArbitrageBotNotifyChannelEnum,
} from "../enum/arbitrage-bot.enums";

export class ArbitrageBotScopeDto {
  @ApiPropertyOptional({ type: [String], description: "Empty means any pair" })
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  @IsOptional()
  pricePairIds?: string[];

  @ApiPropertyOptional({ type: [String], description: "formal / informal; empty means any" })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  marketTypes?: string[];

  @ApiPropertyOptional({ type: [String], description: "Empty means any provider" })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  providerKeys?: string[];

  @ApiPropertyOptional({ type: [Number], description: "Empty means any item" })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsOptional()
  itemIds?: number[];
}

export class ArbitrageBotThresholdsDto {
  @ApiPropertyOptional({ description: "Absolute profit floor for one trade, in Rial" })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minProfitRial?: number;

  @ApiPropertyOptional({ description: "Percentage profit floor for one trade" })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minProfitPercent?: number;

  @ApiPropertyOptional({
    description:
      "Largest position per trade, in the traded item's own unit (0 = limited only by the loss budget)",
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxTradeVolume?: number;

  @ApiPropertyOptional({ description: "Submitted-but-unsettled trades allowed at once" })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxOpenTrades?: number;

  @ApiPropertyOptional({ description: "Cap on new trades per rolling hour" })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxTradesPerHour?: number;

  @ApiPropertyOptional({ description: "Quiet period after a trade, in seconds" })
  @IsInt()
  @Min(0)
  @IsOptional()
  cooldownSeconds?: number;

  @ApiPropertyOptional({ description: "Refuse signals whose quotes are older than this" })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxQuoteAgeSeconds?: number;
}

export class ArbitrageBotNotificationsDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ArbitrageBotNotifyChannelEnum, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsEnum(ArbitrageBotNotifyChannelEnum, { each: true })
  @IsOptional()
  channels?: ArbitrageBotNotifyChannelEnum[];

  @ApiPropertyOptional({ enum: ArbitrageBotEventTypeEnum, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsEnum(ArbitrageBotEventTypeEnum, { each: true })
  @IsOptional()
  events?: ArbitrageBotEventTypeEnum[];

  @ApiPropertyOptional({ description: "Warn at this share of the stop-loss budget" })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  lossWarningPercent?: number;

  @ApiPropertyOptional({ description: "Do not notify about smaller matched signals (Rial)" })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minProfitToNotifyRial?: number;

  @ApiPropertyOptional({ description: "Minimum gap between alerts of the same type" })
  @IsInt()
  @Min(0)
  @IsOptional()
  throttleSeconds?: number;

  @ApiPropertyOptional({ description: "Telegram chat for this bot's alerts" })
  @IsString()
  @IsOptional()
  telegramChatId?: string;

  @ApiPropertyOptional({ description: "Phone for SMS alerts; defaults to the owner's" })
  @IsString()
  @IsOptional()
  smsPhone?: string;
}

export class CreateArbitrageBotDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    enum: ArbitrageBotExecutionModeEnum,
    description:
      "SIGNAL_ONLY records and notifies; AUTO also places both legs. Defaults to SIGNAL_ONLY.",
  })
  @IsEnum(ArbitrageBotExecutionModeEnum)
  @IsOptional()
  executionMode?: ArbitrageBotExecutionModeEnum;

  @ApiPropertyOptional({ type: ArbitrageBotScopeDto })
  @ValidateNested()
  @Type(() => ArbitrageBotScopeDto)
  @IsOptional()
  scope?: ArbitrageBotScopeDto;

  @ApiPropertyOptional({ type: ArbitrageBotThresholdsDto })
  @ValidateNested()
  @Type(() => ArbitrageBotThresholdsDto)
  @IsOptional()
  thresholds?: ArbitrageBotThresholdsDto;

  @ApiPropertyOptional({ type: ArbitrageBotNotificationsDto })
  @ValidateNested()
  @Type(() => ArbitrageBotNotificationsDto)
  @IsOptional()
  notifications?: ArbitrageBotNotificationsDto;

  @ApiPropertyOptional({ description: "Asset the bot's capital and P&L are denominated in" })
  @IsUUID()
  @IsOptional()
  symbolId?: string;

  @ApiPropertyOptional({ description: "Capital to freeze from the owner's manager account" })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  allocatedAmount?: number;

  @ApiPropertyOptional({ description: "Share of the allocation the bot may lose before halting" })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  stopLossPercent?: number;
}
