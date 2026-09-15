/**
 * Where each thing lives in Redis.
 *
 * One place, because the old layout's trouble was that the same fact had three
 * homes — a string per item, a set of key names, and a hash — written by
 * different code paths that did not agree. A provider's prices could be current
 * in one and stale in another, and nothing said which to believe.
 *
 * The rule the shapes follow: one key per provider per concept, written whole.
 * A list that is replaced in one operation is always a consistent list; a list
 * assembled from many keys that expire independently is a list that quietly
 * loses members.
 */

/** The symbols a provider offers: HASH of itemId → metadata. */
export const providerItemsKey = (providerKey: string) => `provider:${providerKey}:items`;

/** A provider's latest price per item: HASH of itemId → price record. */
export const providerPricesKey = (providerKey: string) => `provider:${providerKey}:prices`;

/** One item's price history: ZSET scored by timestamp. */
export const providerHistoryKey = (providerKey: string, itemId: number | string) =>
  `provider:${providerKey}:history:${itemId}`;

/**
 * Providers that currently hold data.
 *
 * An index rather than a `KEYS` scan. `KEYS` walks the whole keyspace and
 * blocks the server while it does, and it was being run on every page load of
 * the admin panel.
 */
export const ACTIVE_PROVIDERS_KEY = 'providers:active';

/** Broadcast channels. Unchanged: consumers outside this repo subscribe to them. */
export const PRICE_UPDATES_CHANNEL = 'price:updates';
export const providerSnapshotChannel = (providerKey: string) => `price:snapshot:${providerKey}`;

/**
 * How long a provider's data outlives its last write.
 *
 * One number for prices and items alike, because they describe the same thing:
 * whether this provider is reporting. Splitting them is how the old layout
 * ended up able to show a symbol list with no prices under it, or prices for
 * symbols that had expired out of the list.
 */
export const PROVIDER_DATA_TTL_SECONDS = 3600;

/** Records kept per item. At a tick a second, roughly the last quarter hour. */
export const HISTORY_LENGTH = 1000;
