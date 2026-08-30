import { Expose } from "class-transformer";

export class PricePairResponseDto {
  @Expose()
  id: string;

  @Expose()
  baseCode: string;

  @Expose()
  quoteCode: string;

  @Expose()
  price: number;

  @Expose()
  lastUpdated: Date;

  @Expose()
  isValid: boolean;

  @Expose()
  buyCommission: number;

  @Expose()
  sellCommission: number;

  @Expose()
  tradingViewSymbol: string;

  @Expose()
  minBuy: number;

  @Expose()
  maxBuy: number;

  @Expose()
  minSell: number;

  @Expose()
  maxSell: number;

  @Expose()
  decimals: number;

  @Expose()
  buyWarnHours?: number;

  @Expose()
  buyExpireHours?: number;

  @Expose()
  buyGraceHours?: number;

  @Expose()
  sellWarnHours?: number;

  @Expose()
  sellExpireHours?: number;

  @Expose()
  sellGraceHours?: number;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
