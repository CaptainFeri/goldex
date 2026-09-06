import { CurrencyUnit } from '../../common/currency-unit';

export interface PriceData {
  itemName?: string;
  groupId?: number;
  groupName?: string;
  unit?: string;
  itemId: number;
  buyPrice: number;
  sellPrice: number;
  buyPriceStr: string;
  sellPriceStr: string;
  canBuy: boolean;
  canSell: boolean;
  buyRange: number;
  sellRange: number;
  maxBuyCount: number;
  maxSellCount: number;
  spread: number;
  spreadPercent: number;
  updatedTimeStr: string;
  timestamp: string;
  iBuy?: boolean;
  iSell?: boolean;
  isShow?: boolean;
  providerKey?: string;
  /** Always IRR once the engine has normalized the quote. */
  priceUnit?: CurrencyUnit;
  /** What the provider itself quoted in, kept for auditing the conversion. */
  sourcePriceUnit?: CurrencyUnit;
  buyPricePerGram?: number;
  sellPricePerGram?: number;
  buyPricePerGramStr?: string;
  sellPricePerGramStr?: string;
}
