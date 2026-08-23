import { IsString, IsNumber, IsBoolean, IsOptional, IsDecimal, Min, Max, IsArray, IsInt } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

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

  // ── Credit v2 pend-deadline time limits (per side) ───────────────
  // x = warn hours, y = expire hours, z = post-expire grace hours.
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

  // Excluded days from deadline calculation (0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday)
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ApiProperty({ required: false, type: [Number], description: "Excluded days (0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday)" })
  excludedDays?: number[];
}
