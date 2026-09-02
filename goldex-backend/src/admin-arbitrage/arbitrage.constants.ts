/** Backend-Redis cache keys holding what the pricing-engine published. */
export const ARBITRAGE_KEYS = {
  OPPORTUNITIES_KEY: 'arbitrage:opportunities',
  ALERTS_KEY: 'arbitrage:alerts',
  SCAN_META_KEY: 'arbitrage:last-scan',
  STATS_KEY: 'arbitrage:stats',
} as const;

export const ARBITRAGE_CACHE_TTL_SECONDS = 3600;

/**
 * A scan older than this is reported as stale. The engine's safety-net scan
 * runs every 10s, so a minute of silence means the stream has stopped.
 */
export const ARBITRAGE_STALE_AFTER_SECONDS = 60;
