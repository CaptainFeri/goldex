import { MarketPoolType, MarketStatus } from './entity/pair-pool-status.entity';

/**
 * Why a pool is in the state it is. Stored on `pair_pool_status.reason` and
 * surfaced in the admin panel — "CLOSED" alone never told an operator whether
 * the cause was staleness, a missing provider price, or another admin.
 */
export enum MarketStatusReason {
  /** MARKET: a provider is reporting a fresh price. */
  PRICE_FRESH = 'price-fresh',
  /** MARKET: the last provider price is older than the freshness window. */
  STALE_PRICE = 'stale-price',
  /** MARKET: no provider has ever reported a best price for this pair. */
  NO_PRICE = 'no-price',
  /** MARKET: the direct quote is unusable but a bridged route is live. */
  BRIDGE_PRICE = 'bridge-price',
  /** LIMIT / QUOTE: open by default, no derivation applies. */
  POOL_DEFAULT_OPEN = 'pool-default-open',
  /** An admin forced this pool open or closed. */
  ADMIN_OVERRIDE = 'admin-override',
}

/** One pair × one pool, always present even when never reconciled. */
export interface PairPoolStatusView {
  pairId: string;
  pairLabel: string;
  baseSlug: string | null;
  quoteSlug: string | null;
  isValid: boolean;
  /** When a provider last priced this pair. */
  lastPriceAt: string | null;
  poolType: MarketPoolType;
  derivedStatus: MarketStatus;
  adminOverride: MarketStatus | null;
  effectiveStatus: MarketStatus;
  reason: MarketStatusReason;
  /** Bridge symbol carrying the price, when the reason is `bridge-price`. */
  bridgeSlug: string | null;
  /** False when the row is derived on the fly, not yet written by a sweep. */
  persisted: boolean;
  updatedAt: string | null;
}

export interface MarketStatusSummary {
  totalPairs: number;
  openPairs: number;
  /** Pairs whose every pool is closed. */
  fullyClosedPairs: number;
  overriddenPools: number;
  /** Pairs whose MARKET pool is closed because the price went stale. */
  stalePricePairs: number;
  /** Pairs quoted through a bridge rather than their own direct price. */
  bridgedPairs: number;
  byPool: Record<MarketPoolType, { open: number; closed: number; overridden: number }>;
}
