import type { OurAction } from '../price/price.types';

export type TradeSource = 'ARBITRAGE' | 'MARKET_MAKER';

export type TradeSide = 'BUY' | 'SELL';

/** One symbol wallet: gold balance (kg) + average cost basis (Toman per kg). */
export interface SymbolWallet {
  /** Delivery type within the normal sub-type — the symbol identity. */
  symbol: string;
  /** Current gold balance in kilograms. */
  goldKg: number;
  /** Average purchase cost per kilogram (Toman). */
  avgCostKg: number;
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
  trades: TradeRecord[];
}

export interface WalletQuery {
  source?: TradeSource;
  symbol?: string;
  from?: number;
  to?: number;
  executed?: boolean;
}
