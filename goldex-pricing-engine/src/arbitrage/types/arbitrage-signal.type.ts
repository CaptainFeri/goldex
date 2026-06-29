export type ArbitrageLegAction = 'buy' | 'sell';

export interface ArbitrageLeg {
  providerKey: string;
  itemId: number;
  /** `buy` = we buy from this provider (their sell side); `sell` = we sell to them (their buy side). */
  action: ArbitrageLegAction;
  price: number;
  priceStr: string;
  timestamp: string;
}

export interface ArbitrageSignal {
  id: string;
  /** Stable identity of the opportunity: `<itemId>:<buyProvider>-><sellProvider>`. */
  key: string;
  itemId: number;
  itemName: string;
  groupId: number;
  groupName: string;
  unit: string;
  /** Cheapest place to buy (a provider's sell side). */
  buyLeg: ArbitrageLeg;
  /** Most expensive place to sell (a provider's buy side). */
  sellLeg: ArbitrageLeg;
  /** [buyLeg, sellLeg] — ordered execution path. */
  legs: ArbitrageLeg[];
  profitToman: number;
  profitPercent: number;
  /** Profit expressed in grams of gold using `goldPriceRef`. */
  profitGold: number;
  goldPriceRef: number;
  /** ISO time after which the underlying quotes are considered stale. */
  deadline: string;
  detectedAt: string;
}

export interface ArbitrageScanResult {
  signals: ArbitrageSignal[];
  scannedAt: string;
  /** What kicked off this scan. */
  trigger: 'startup' | 'realtime' | 'interval' | 'manual';
  totalProviders: number;
  totalItems: number;
  opportunityCount: number;
  bestProfitToman: number;
}

export interface ArbitrageConfig {
  /** Minimum absolute profit (toman) for a signal to be emitted. */
  minProfitToman: number;
  /** Minimum profit percentage (relative to buy price) for a signal. */
  minProfitPercent: number;
  /** Cap on the number of signals returned/persisted per scan. */
  maxSignals: number;
  /** How long a quote stays fresh; older quotes are ignored when matching. */
  quoteFreshnessMs: number;
  /** TTL applied to the persisted current scan in Redis. */
  signalTtlMs: number;
  /** Safety-net full scan cadence (independent of price ticks). */
  scanIntervalMs: number;
  /** Coalescing window for real-time recomputes triggered by price ticks. */
  recomputeDebounceMs: number;
}

export interface ArbitrageStats {
  running: boolean;
  lastScanAt: string | null;
  lastTrigger: ArbitrageScanResult['trigger'] | null;
  lastSignalCount: number;
  totalScans: number;
  totalSignalsDetected: number;
  providersTracked: number;
  itemsTracked: number;
  config: ArbitrageConfig;
}
