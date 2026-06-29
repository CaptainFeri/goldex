import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import Redis from 'ioredis';
import { PriceData } from '../real-time-provider/types/price-data.type';

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

  async get(key: string): Promise<PriceData | null> {
    const data = await this.redis.get(key);
    return data ? (JSON.parse(data) as PriceData) : null;
  }

  async setCurrentPrice(providerKey: string, itemId: number, priceData: PriceData): Promise<void> {
    const key = `price:current:${providerKey}:${itemId}`;
    await this.redis.set(key, JSON.stringify(priceData));
    await this.redis.expire(key, 3600);
    await this.redis.sadd(`price:current:providers:${providerKey}`, key);
  }

  async getCurrentPrice(providerKey: string, itemId: number): Promise<PriceData | null> {
    const key = `price:current:${providerKey}:${itemId}`;
    const data = await this.redis.get(key);
    return data ? (JSON.parse(data) as PriceData) : null;
  }

  async getAllCurrentPrices(providerKey?: string): Promise<PriceData[]> {
    let keys: string[];
    if (providerKey) {
      keys = await this.redis.smembers(`price:current:providers:${providerKey}`);
    } else {
      // Each provider stores its price keys in a SET named
      // `price:current:providers:<key>`. Enumerate those set keys first
      // (KEYS expands the glob), then read the members of each set.
      const providerSetKeys = await this.redis.keys('price:current:providers:*');
      keys = [];
      for (const setKey of providerSetKeys) {
        const memberKeys = await this.redis.smembers(setKey);
        keys.push(...memberKeys);
      }
    }
    const prices: PriceData[] = [];
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        prices.push(JSON.parse(data) as PriceData);
      }
    }
    return prices;
  }

  async saveItems(providerKey: string, items: PriceData[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    const snapshotKey = `price:snapshot:${providerKey}`;
    pipeline.del(snapshotKey);
    for (const item of items) {
      item.providerKey = providerKey;
      const key = `price:current:${providerKey}:${item.itemId}`;
      pipeline.set(key, JSON.stringify(item));
      pipeline.expire(key, 3600);
      pipeline.sadd(`price:current:providers:${providerKey}`, key);
      pipeline.hset(snapshotKey, String(item.itemId), JSON.stringify(item));
    }
    pipeline.expire(snapshotKey, 3600);
    await pipeline.exec();
  }

  async addPriceToHistory(
    providerKey: string,
    itemId: number,
    priceData: PriceData,
  ): Promise<void> {
    const key = `price:history:${providerKey}:${itemId}`;
    const score = new Date(priceData.timestamp).getTime();
    const value = JSON.stringify({ ...priceData, providerKey });
    await this.redis.zadd(key, score, value);
    await this.redis.zremrangebyrank(key, 0, -1001);
  }

  async getPriceHistory(providerKey: string, itemId: number, limit = 100): Promise<PriceData[]> {
    const key = `price:history:${providerKey}:${itemId}`;
    const data = await this.redis.zrevrange(key, 0, limit - 1);
    return data.map((d) => JSON.parse(d) as PriceData);
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

  async deletePriceData(providerKey: string, itemId: number): Promise<void> {
    await this.redis.del(`price:current:${providerKey}:${itemId}`);
    await this.redis.del(`price:history:${providerKey}:${itemId}`);
    await this.redis.srem(
      `price:current:providers:${providerKey}`,
      `price:current:${providerKey}:${itemId}`,
    );
  }

  async clearAllPrices(providerKey?: string): Promise<void> {
    if (providerKey) {
      const keys = await this.redis.smembers(`price:current:providers:${providerKey}`);
      if (keys.length) await this.redis.del(...keys);
      await this.redis.del(`price:current:providers:${providerKey}`);
      const historyKeys = await this.redis.keys(`price:history:${providerKey}:*`);
      if (historyKeys.length) await this.redis.del(...historyKeys);
    } else {
      const keys = await this.redis.keys('price:*');
      if (keys.length) await this.redis.del(...keys);
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
    await this.redis.publish('price:updates', JSON.stringify(priceData));
  }

  async subscribeToPriceUpdates(callback: (priceData: PriceData) => void): Promise<() => void> {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe('price:updates');
    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel === 'price:updates') {
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
        void this.subscriber.unsubscribe('price:updates');
        this.subscriber.disconnect();
        this.subscriber = null;
      }
    };
  }

  async setSnapshot(providerKey: string, items: PriceData[]): Promise<void> {
    const key = `price:snapshot:${providerKey}`;
    const pipeline = this.redis.pipeline();
    pipeline.del(key);
    for (const item of items) {
      item.providerKey = providerKey;
      pipeline.hset(key, String(item.itemId), JSON.stringify(item));
    }
    pipeline.expire(key, 3600);
    await pipeline.exec();
  }

  async getSnapshot(providerKey: string): Promise<PriceData[]> {
    const key = `price:snapshot:${providerKey}`;
    const data = await this.redis.hgetall(key);
    return Object.values(data).map((d) => JSON.parse(d) as PriceData);
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
    await this.redis.publish(`price:snapshot:${providerKey}`, message);
  }

  async deleteSnapshot(providerKey: string): Promise<void> {
    await this.redis.del(`price:snapshot:${providerKey}`);
  }

  async setMetadata(key: string, metadata: unknown): Promise<void> {
    await this.redis.set(key, JSON.stringify(metadata));
    await this.redis.expire(key, 86400);
  }

  async getMetadata(key: string): Promise<unknown> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
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
