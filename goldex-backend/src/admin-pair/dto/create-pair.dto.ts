// create-price-pair.dto.ts
import { IsString, IsNumber, IsBoolean, IsOptional, IsEnum, IsDecimal, Min, Max } from "class-validator";
import { MarketTypeEnum } from "../enum/market.type.enum";
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

  @IsEnum(MarketTypeEnum)
  @ApiProperty()
  marketType?: MarketTypeEnum;
}
