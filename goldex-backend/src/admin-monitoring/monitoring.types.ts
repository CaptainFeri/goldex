/** A price pair this provider item feeds, resolved from provider_pair_mappings. */
export interface MappedPairRef {
  pairId: string;
  pairLabel: string;
  baseSlug: string | null;
  quoteSlug: string | null;
  useBuyPrice: boolean;
  useSellPrice: boolean;
}

/**
 * One item of a provider's live snapshot.
 *
 * Merges the engine's item metadata (`item:metadata:*`, the authoritative
 * names) with its current prices (`price:current:*`), so an item that has
 * metadata but no live quote is still listed — and adds the Goldex pairs the
 * item is mapped to, which is what makes the row meaningful to an admin.
 */
export interface ProviderSnapshotItem {
  itemId: number;
  /** Provider's own item name, e.g. "طلای آبشده". */
  name: string | null;
  unit: string | null;
  groupId: number | null;
  groupName: string | null;
  buyPrice: number | null;
  sellPrice: number | null;
  buyPricePerGram: number | null;
  sellPricePerGram: number | null;
  canBuy: boolean;
  canSell: boolean;
  spread: number | null;
  spreadPercent: number | null;
  timestamp: string | null;
  /** No current price at all, or one older than the freshness window. */
  stale: boolean;
  /** Goldex price pairs fed by this item. Empty when the item is unmapped. */
  mappedPairs: MappedPairRef[];
}

export interface ProviderSnapshot {
  providerKey: string;
  items: ProviderSnapshotItem[];
  /** Newest price timestamp across the provider's items. */
  lastUpdate: string | null;
  totalItems: number;
  pricedItems: number;
  mappedItems: number;
}
