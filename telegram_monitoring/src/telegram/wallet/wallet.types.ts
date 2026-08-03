import type { OurAction } from '../price/price.types';

export type TradeSource = 'ARBITRAGE' | 'MARKET_MAKER';

export type TradeSide = 'BUY' | 'SELL';

/** One cost-basis lot of gold held in a symbol wallet (FIFO). */
export interface GoldLot {
  id: number;
  /**
   * Cost basis per kilogram in Toman. 0 = free seed gold: charged at the
   * sale price when consumed, so it never books a profit or a loss.
   */
  pricePerKg: number;
  /** Remaining quantity in kilograms. */
  qtyKg: number;
}

/** One symbol wallet: gold inventory as FIFO lots (seed = free 0-cost lot). */
export interface SymbolWallet {
  /** Delivery type within the normal sub-type — the symbol identity. */
  symbol: string;
  /** Current gold balance in kilograms (sum of remaining lot quantities). */
  goldKg: number;
  /** Remaining lots, oldest first — sells consume the oldest lots. */
  lots: GoldLot[];
}

/** A simulated (paper) trade executed against the wallet. */
export interface TradeRecord {
  id: number;
  /** Unix seconds. */
  date: number;
  source: TradeSource;
  symbol: string;
  subType: string;
  side: TradeSide;
  ourAction?: OurAction;
  /** Per mesqal price the trade executed at. */
  price: number;
  /** Quantity in kilograms (1 تا = 1 kg). */
  quantityKg: number;
  /** Cash flow in Toman: cost for BUY, proceeds for SELL. */
  amount: number;
  /** Realized profit for SELL legs; 0 for BUY legs. */
  profit: number;
  executed: boolean;
  reason?: string;
}

export interface WalletSnapshot {
  symbols: SymbolWallet[];
  irrBalance: number;
  totalRealizedProfit: number;
  /** Cash + cost basis of held gold — the asset base for the cash reserve. */
  equity: number;
  /** Cash kept aside (reserveRatio × equity) and never spent on buys. */
  cashReserve: number;
  /** Cash available for buys above the reserve: irrBalance − cashReserve. */
  buyingPower: number;
  trades: TradeRecord[];
}

export interface WalletQuery {
  source?: TradeSource;
  symbol?: string;
  from?: number;
  to?: number;
  executed?: boolean;
}
