import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsDecimal,
  IsEnum,
  Matches,
  Min,
  Max,
  IsArray,
  IsInt,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import {
  CreditDeadlineModeEnum,
  DEFAULT_DEADLINE_TIMEZONE,
} from "../../credit/enum/credit-deadline-mode.enum";

/** 24-hour wall clock, e.g. "14:00". */
const CLOCK_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** Calendar day, e.g. "2026-03-21". */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreatePricePairDto {
  @IsString()
  @ApiProperty()
  baseCode: string;

  @IsString()
  @ApiProperty()
  quoteCode: string;

  @IsNumber()
  @Type(() => Number)
  @ApiProperty()
  price: number;

  @IsBoolean()
  @ApiProperty()
  isValid: boolean;

  @IsNumber()
  @Type(() => Number)
  @ApiProperty()
  buyCommission: number;

  @IsNumber()
  @Type(() => Number)
  @ApiProperty()
  sellCommission: number;

  @IsString()
  @ApiProperty()
  tradingViewSymbol: string;

  @IsNumber()
  @Type(() => Number)
  @ApiProperty()
  minBuy: number;

  @IsNumber()
  @Type(() => Number)
  @ApiProperty()
  maxBuy: number;

  @IsNumber()
  @Type(() => Number)
  @ApiProperty()
  minSell: number;

  @IsNumber()
  @Type(() => Number)
  @ApiProperty()
  maxSell: number;

  @IsNumber()
  @ApiProperty()
  decimals: number;

  // ── Credit pend-deadline convention (per side) ───────────────────
  // NONE = the pair never ages a credit request; RELATIVE = x/y/z hours from
  // registration; DAILY_CUTOFF = a wall-clock time of day in `deadlineTimezone`.
  @IsOptional()
  @IsEnum(CreditDeadlineModeEnum)
  @ApiProperty({ required: false, enum: CreditDeadlineModeEnum })
  buyDeadlineMode?: CreditDeadlineModeEnum;

  @IsOptional()
  @IsEnum(CreditDeadlineModeEnum)
  @ApiProperty({ required: false, enum: CreditDeadlineModeEnum })
  sellDeadlineMode?: CreditDeadlineModeEnum;

  @IsOptional()
  @Matches(CLOCK_TIME_RE, { message: "buyWarnTime must be a 24h HH:mm time" })
  @ApiProperty({ required: false, example: "12:00", description: "DAILY_CUTOFF warn time" })
  buyWarnTime?: string;

  @IsOptional()
  @Matches(CLOCK_TIME_RE, { message: "buyExpireTime must be a 24h HH:mm time" })
  @ApiProperty({ required: false, example: "14:00", description: "DAILY_CUTOFF settlement cutoff" })
  buyExpireTime?: string;

  @IsOptional()
  @Matches(CLOCK_TIME_RE, { message: "sellWarnTime must be a 24h HH:mm time" })
  @ApiProperty({ required: false, example: "12:00", description: "DAILY_CUTOFF warn time" })
  sellWarnTime?: string;

  @IsOptional()
  @Matches(CLOCK_TIME_RE, { message: "sellExpireTime must be a 24h HH:mm time" })
  @ApiProperty({ required: false, example: "14:00", description: "DAILY_CUTOFF settlement cutoff" })
  sellExpireTime?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    required: false,
    default: DEFAULT_DEADLINE_TIMEZONE,
    description: "IANA timezone every deadline on this pair is reckoned in",
  })
  deadlineTimezone?: string;

  @IsOptional()
  @IsArray()
  @Matches(ISO_DATE_RE, { each: true, message: "holidayDates must be YYYY-MM-DD dates" })
  @ApiProperty({
    required: false,
    type: [String],
    description: "Dated exceptions (YYYY-MM-DD) on which this pair does not settle",
  })
  holidayDates?: string[];

  // RELATIVE: x = warn hours, y = expire hours. z (grace) applies to both modes.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  buyWarnHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  buyExpireHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  buyGraceHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  sellWarnHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  sellExpireHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  sellGraceHours?: number;

  // Weekly closures skipped by every deadline on this pair.
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ApiProperty({ required: false, type: [Number], description: "Excluded days (0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday)" })
  excludedDays?: number[];
}
