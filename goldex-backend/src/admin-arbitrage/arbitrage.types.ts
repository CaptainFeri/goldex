export interface ArbitrageLeg {
  providerKey: string;
  itemId: number;
  action: 'buy' | 'sell';
  price: number;
  priceStr: string;
  timestamp: string;
}

export interface ArbitrageSignal {
  id: string;
  key: string;
  itemId: number;
  itemName: string;
  groupId: number;
  groupName: string;
  unit: string;
  buyLeg: ArbitrageLeg;
  sellLeg: ArbitrageLeg;
  legs: ArbitrageLeg[];
  profitRial: number;
  profitPercent: number;
  profitGold: number;
  goldPriceRef: number;
  deadline: string;
  detectedAt: string;
}

export interface ArbitrageScanResult {
  signals: ArbitrageSignal[];
  scannedAt: string;
  trigger: 'startup' | 'realtime' | 'interval' | 'manual';
  totalProviders: number;
  totalItems: number;
  opportunityCount: number;
  bestProfitRial: number;
}

/** Flattened metadata of the most recent scan, as cached for the panel. */
export interface ArbitrageScanMeta {
  scannedAt?: string;
  trigger?: string;
  totalProviders?: number;
  totalItems?: number;
  bestProfitRial?: number;
  opportunityCount?: number;
  source?: ArbitrageSource;
}

export interface ArbitrageConfig {
  minProfitRial: number;
  minProfitPercent: number;
  maxSignals: number;
  quoteFreshnessMs: number;
  signalTtlMs: number;
  scanIntervalMs: number;
  recomputeDebounceMs: number;
}

/** Where the opportunities the panel is looking at actually came from. */
export type ArbitrageSource = 'bus' | 'pricing-redis' | 'none';

export interface ArbitrageStatus {
  /** `bus` = the RabbitMQ fan-out cache, `pricing-redis` = read straight from
   *  the engine's own Redis, `none` = neither had anything. */
  source: ArbitrageSource;
  scannedAt: string | null;
  /** Age of the last scan in seconds, or null when there is no scan at all. */
  ageSeconds: number | null;
  /** A scan older than this is treated as stale by the panel. */
  staleAfterSeconds: number;
  stale: boolean;
  trigger: string | null;
  opportunityCount: number;
  totalProviders: number;
  totalItems: number;
  bestProfitRial: number;
  /** Whether the engine's Redis answered a PING just now. */
  engineRedisReachable: boolean;
  /** Set when nothing is arriving, so the panel can say why. */
  message?: string;
}
