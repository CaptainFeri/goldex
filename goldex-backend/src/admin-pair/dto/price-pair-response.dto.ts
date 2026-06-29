import { Expose } from "class-transformer";
import { MarketTypeEnum } from "../enum/market.type.enum";

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
  marketType: MarketTypeEnum;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
