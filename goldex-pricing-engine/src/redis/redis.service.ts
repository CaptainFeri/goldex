import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import Redis from 'ioredis';
import { PriceData } from '../real-time-provider/types/price-data.type';
import {
  ACTIVE_PROVIDERS_KEY,
  HISTORY_LENGTH,
  PRICE_UPDATES_CHANNEL,
  PROVIDER_DATA_TTL_SECONDS,
  providerHistoryKey,
  providerItemsKey,
  providerPricesKey,
  providerSnapshotChannel,
} from './keys';

export { PriceData };

@Injectable()
export class RedisService implements OnModuleDestroy {
  private subscriber: Redis | null = null;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly formatter: ConsoleFormatterService,
  ) {}

  async onModuleDestroy() {
    if (this.subscriber) {
      this.subscriber.disconnect();
    }
    await this.redis.quit();
  }

  async setCurrentPriceWithKey(key: string, priceData: PriceData): Promise<void> {
    await this.redis.set(key, JSON.stringify(priceData), 'EX', 60);
  }

  async setJson(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? (JSON.parse(data) as T) : null;
  }

  async get(key: string): Promise<PriceData | null> {
    const data = await this.redis.get(key);
    return data ? (JSON.parse(data) as PriceData) : null;
  }

  /**
   * One item's latest price.
   *
   * A field in the provider's price hash rather than a key of its own. The
   * previous layout wrote a string per item, added its *name* to a set, and
   * separately maintained a snapshot hash — three places, kept in step by
   * whichever call site remembered to. The set in particular was never pruned:
   * its members were key names that expired an hour later, so it grew for ever
   * and still counted a provider as reporting long after it had stopped.
   */
  async setCurrentPrice(providerKey: string, itemId: number, priceData: PriceData): Promise<void> {
    priceData.providerKey = providerKey;
    const key = providerPricesKey(providerKey);
    const pipeline = this.redis.pipeline();
    pipeline.hset(key, String(itemId), JSON.stringify(priceData));
    // Refreshed on every write, so the provider's data lives as long as it
    // keeps reporting and expires as a whole when it stops.
    pipeline.expire(key, PROVIDER_DATA_TTL_SECONDS);
    pipeline.sadd(ACTIVE_PROVIDERS_KEY, providerKey);
    await pipeline.exec();
  }

  async getCurrentPrice(providerKey: string, itemId: number): Promise<PriceData | null> {
    const data = await this.redis.hget(providerPricesKey(providerKey), String(itemId));
    return data ? (JSON.parse(data) as PriceData) : null;
  }

  async getAllCurrentPrices(providerKey?: string): Promise<PriceData[]> {
    const providers = providerKey ? [providerKey] : await this.getActiveProviders();
    const prices: PriceData[] = [];
    for (const key of providers) {
      const entries = await this.redis.hgetall(providerPricesKey(key));
      for (const raw of Object.values(entries)) {
        const parsed = this.parse<PriceData>(raw);
        if (parsed) prices.push(parsed);
      }
    }
    return prices;
  }

  /**
   * Providers holding data, from the index rather than a scan.
   *
   * The index can name a provider whose data has since expired, so each one is
   * checked. That is a handful of O(1) lookups against a `KEYS` sweep of the
   * whole keyspace, which blocks the server for its duration and was being run
   * on every panel page load.
   */
  async getActiveProviders(): Promise<string[]> {
    const named = await this.redis.smembers(ACTIVE_PROVIDERS_KEY);
    if (named.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const key of named) pipeline.exists(providerPricesKey(key));
    const results = await pipeline.exec();

    const live: string[] = [];
    const dead: string[] = [];
    named.forEach((key, i) => (results?.[i]?.[1] ? live : dead).push(key));
    // Tidied here rather than by a sweeper: this is the only place that learns
    // a provider has gone quiet, and an index nobody prunes is the bug this
    // layout replaced.
    if (dead.length) await this.redis.srem(ACTIVE_PROVIDERS_KEY, ...dead);
    return live.sort();
  }

  /**
   * Replace a provider's whole price hash.
   *
   * Written whole so the result is always a consistent set: every item the
   * provider is quoting and nothing it has stopped quoting. Merging into the
   * existing hash would leave withdrawn items behind until they expired —
   * which, since the hash expires as one key, would be never.
   */
  async saveItems(providerKey: string, items: PriceData[]): Promise<void> {
    const key = providerPricesKey(providerKey);
    const pipeline = this.redis.pipeline();
    pipeline.del(key);
    for (const item of items) {
      item.providerKey = providerKey;
      pipeline.hset(key, String(item.itemId), JSON.stringify(item));
    }
    pipeline.expire(key, PROVIDER_DATA_TTL_SECONDS);
    pipeline.sadd(ACTIVE_PROVIDERS_KEY, providerKey);
    await pipeline.exec();
  }

  async addPriceToHistory(
    providerKey: string,
    itemId: number,
    priceData: PriceData,
  ): Promise<void> {
    const key = providerHistoryKey(providerKey, itemId);
    const score = new Date(priceData.timestamp).getTime();
    const pipeline = this.redis.pipeline();
    pipeline.zadd(key, score, JSON.stringify({ ...priceData, providerKey }));
    pipeline.zremrangebyrank(key, 0, -(HISTORY_LENGTH + 1));
    // The old history keys never expired. Each was capped, so none grew large,
    // but the number of them grew without limit as items came and went.
    pipeline.expire(key, PROVIDER_DATA_TTL_SECONDS);
    await pipeline.exec();
  }

  async getPriceHistory(providerKey: string, itemId: number, limit = 100): Promise<PriceData[]> {
    const key = providerHistoryKey(providerKey, itemId);
    const data = await this.redis.zrevrange(key, 0, limit - 1);
    return data.map((d) => this.parse<PriceData>(d)).filter((p): p is PriceData => p !== null);
  }

  /** A malformed record is skipped, not thrown: one bad row must not blank a page. */
  private parse<T>(raw: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async getStatistics(providerKey?: string): Promise<{
    totalItems: number;
    totalRecords: number;
    lastUpdate: Date | null;
    activeTrades: number;
  }> {
    const currentPrices = await this.getAllCurrentPrices(providerKey);
    const totalItems = currentPrices.length;

    let totalRecords = 0;
    let activeTrades = 0;
    let lastUpdate: Date | null = null;

    for (const price of currentPrices) {
      const historyKey = `price:history:${price.providerKey}:${price.itemId}`;
      const count = await this.redis.zcard(historyKey);
      totalRecords += count;

      if (price.canBuy || price.canSell) activeTrades++;

      const ts = new Date(price.timestamp);
      if (!lastUpdate || ts > lastUpdate) lastUpdate = ts;
    }

    return { totalItems, totalRecords, lastUpdate, activeTrades };
  }

  /** Drop one item: its quote, its history, and its place in the item list. */
  async deletePriceData(providerKey: string, itemId: number): Promise<void> {
    await this.redis
      .pipeline()
      .hdel(providerPricesKey(providerKey), String(itemId))
      .hdel(providerItemsKey(providerKey), String(itemId))
      .del(providerHistoryKey(providerKey, itemId))
      .exec();
  }

  /**
   * Forget a provider's data, or everyone's.
   *
   * History is found through the item list rather than by scanning for
   * `history:*`, so this stays O(items) instead of O(keyspace).
   */
  async clearAllPrices(providerKey?: string): Promise<void> {
    const providers = providerKey ? [providerKey] : await this.redis.smembers(ACTIVE_PROVIDERS_KEY);

    for (const key of providers) {
      const [items, prices] = await Promise.all([
        this.redis.hkeys(providerItemsKey(key)),
        this.redis.hkeys(providerPricesKey(key)),
      ]);
      const itemIds = [...new Set([...items, ...prices])];

      const pipeline = this.redis.pipeline();
      pipeline.del(providerItemsKey(key));
      pipeline.del(providerPricesKey(key));
      for (const id of itemIds) pipeline.del(providerHistoryKey(key, id));
      pipeline.srem(ACTIVE_PROVIDERS_KEY, key);
      await pipeline.exec();
    }
  }

  async getConnectionStatus(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  async publishPriceUpdate(priceData: PriceData): Promise<void> {
    await this.redis.publish(PRICE_UPDATES_CHANNEL, JSON.stringify(priceData));
  }

  async subscribeToPriceUpdates(callback: (priceData: PriceData) => void): Promise<() => void> {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(PRICE_UPDATES_CHANNEL);
    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel === PRICE_UPDATES_CHANNEL) {
        try {
          const data = JSON.parse(message) as PriceData;
          callback(data);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.formatter.error('Redis', `Failed to parse price update: ${msg}`);
        }
      }
    });

    return () => {
      if (this.subscriber) {
        void this.subscriber.unsubscribe(PRICE_UPDATES_CHANNEL);
        this.subscriber.disconnect();
        this.subscriber = null;
      }
    };
  }

  /**
   * The snapshot is the price hash.
   *
   * It used to be a second hash written beside the per-item strings, and only
   * by some of the paths that wrote prices — so the two drifted and a reader
   * could not tell which was current. There is one now, and this writes it.
   */
  async setSnapshot(providerKey: string, items: PriceData[]): Promise<void> {
    await this.saveItems(providerKey, items);
  }

  async getSnapshot(providerKey: string): Promise<PriceData[]> {
    const data = await this.redis.hgetall(providerPricesKey(providerKey));
    return Object.values(data)
      .map((d) => this.parse<PriceData>(d))
      .filter((p): p is PriceData => p !== null);
  }

  async publishSnapshot(providerKey: string, validItemIds?: Set<number>): Promise<void> {
    const items = validItemIds
      ? (await this.getSnapshot(providerKey)).filter((item) => validItemIds.has(item.itemId))
      : await this.getSnapshot(providerKey);
    const message = JSON.stringify({
      providerKey,
      items,
      timestamp: new Date().toISOString(),
    });
    await this.redis.publish(providerSnapshotChannel(providerKey), message);
  }

  /** A provider that has stopped reporting leaves nothing behind. */
  async deleteSnapshot(providerKey: string): Promise<void> {
    await this.redis
      .pipeline()
      .del(providerPricesKey(providerKey))
      .srem(ACTIVE_PROVIDERS_KEY, providerKey)
      .exec();
  }

  // ── The symbols a provider offers ─────────────────────────────────────────

  /**
   * Replace a provider's whole item list.
   *
   * One hash, written in one operation, so what a reader sees is always a set
   * the provider actually offered at some single moment. The previous layout
   * gave each item its own key with its own day-long expiry: the list did not
   * shrink when a provider withdrew a symbol, and it *did* shrink, item by
   * item, when metadata simply stopped being refreshed. Either way what a
   * reader got was a list that had never existed.
   */
  async setProviderItems(providerKey: string, items: unknown[]): Promise<void> {
    const key = providerItemsKey(providerKey);
    const pipeline = this.redis.pipeline();
    pipeline.del(key);
    for (const item of items) {
      const id = (item as { itemId?: number | string })?.itemId;
      if (id === undefined || id === null) continue;
      pipeline.hset(key, String(id), JSON.stringify(item));
    }
    pipeline.expire(key, PROVIDER_DATA_TTL_SECONDS);
    pipeline.sadd(ACTIVE_PROVIDERS_KEY, providerKey);
    await pipeline.exec();
  }

  /**
   * Add or replace one symbol in the list.
   *
   * A single field write, so two callers touching different items cannot
   * overwrite each other — which a read-modify-write of the whole list would
   * let them do.
   */
  async setProviderItem(providerKey: string, itemId: number, item: unknown): Promise<void> {
    const key = providerItemsKey(providerKey);
    await this.redis
      .pipeline()
      .hset(key, String(itemId), JSON.stringify(item))
      .expire(key, PROVIDER_DATA_TTL_SECONDS)
      .sadd(ACTIVE_PROVIDERS_KEY, providerKey)
      .exec();
  }

  /** Everything a provider offers, in one round trip. */
  async getProviderItems<T = unknown>(providerKey: string): Promise<T[]> {
    const data = await this.redis.hgetall(providerItemsKey(providerKey));
    return Object.values(data)
      .map((d) => this.parse<T>(d))
      .filter((v): v is T => v !== null);
  }

  async getProviderItem<T = unknown>(providerKey: string, itemId: number): Promise<T | null> {
    const data = await this.redis.hget(providerItemsKey(providerKey), String(itemId));
    return data ? this.parse<T>(data) : null;
  }

  async getKeys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }

  // ── Arbitrage ──────────────────────────────────────────────────────────
  // Mirrors the price flow above: a "current" snapshot with a short TTL, a
  // capped sorted-set history, and a pub/sub channel for live consumers.

  async setArbitrageScan(result: unknown, ttlSeconds = 120): Promise<void> {
    await this.redis.set('arbitrage:current', JSON.stringify(result), 'EX', ttlSeconds);
  }

  async getArbitrageScan<T = unknown>(): Promise<T | null> {
    const data = await this.redis.get('arbitrage:current');
    return data ? (JSON.parse(data) as T) : null;
  }

  async addArbitrageHistory(signals: { detectedAt: string }[]): Promise<void> {
    if (signals.length === 0) return;
    const key = 'arbitrage:history';
    const pipeline = this.redis.pipeline();
    for (const signal of signals) {
      const score = new Date(signal.detectedAt).getTime();
      pipeline.zadd(key, score, JSON.stringify(signal));
    }
    pipeline.zremrangebyrank(key, 0, -1001);
    await pipeline.exec();
  }

  async getArbitrageHistory<T = unknown>(limit = 100): Promise<T[]> {
    const data = await this.redis.zrevrange('arbitrage:history', 0, limit - 1);
    return data.map((d) => JSON.parse(d) as T);
  }

  async publishArbitrageUpdate(result: unknown): Promise<void> {
    await this.redis.publish('arbitrage:updates', JSON.stringify(result));
  }
}
