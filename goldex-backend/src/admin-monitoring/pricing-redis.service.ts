import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService, ConfigType } from "@nestjs/config";
import Redis from "ioredis";
import appEnvConfig from "../config/app.env.config";

// Shape of each history record as written by the pricing-engine
// (`price:history:{provider}:{itemId}` ZSET members).
export interface ProviderPriceData {
  itemId: number;
  itemName?: string;
  unit?: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  canBuy: boolean;
  canSell: boolean;
  timestamp: string;
  providerKey?: string;
  buyPricePerGram?: number;
  sellPricePerGram?: number;
  [key: string]: any;
}

/**
 * Read-only client to the PRICING-ENGINE Redis (a separate instance from the
 * backend's own Redis). Surfaces provider price history for the admin charts.
 * The pricing-engine codebase is never modified — we read its keys directly.
 */
@Injectable()
export class PricingRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(PricingRedisService.name);
  private readonly client: Redis;

  constructor(private readonly config: ConfigService<ConfigType<typeof appEnvConfig>>) {
    const cfg = this.config.get("pricingRedis", { infer: true });
    this.client = new Redis({
      host: cfg.host,
      port: cfg.port,
      db: cfg.db,
      password: cfg.password || undefined,
      lazyConnect: false,
      // Queue commands while reconnecting instead of failing fast — the pricing
      // Redis may restart independently of the backend.
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      // Cap how long a queued command waits so a permanent outage fails the
      // request (within 5s) instead of hanging the SPA forever.
      commandTimeout: 5000,
      // Don't crash the backend if the pricing Redis is unreachable.
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    this.client.on("error", (err) => this.logger.warn(`pricing-redis error: ${err.message}`));
    this.logger.log(`PricingRedisService -> ${cfg.host}:${cfg.port} (db ${cfg.db})`);
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      /* ignore */
    }
  }

  /** Provider keys that currently have data in the pricing Redis. */
  async getProviders(): Promise<string[]> {
    const keys = await this.client.keys("price:current:providers:*");
    return keys.map((k) => k.replace("price:current:providers:", "")).sort();
  }

  /**
   * Full provider registry written by the pricing-engine (active AND inactive),
   * key `providers:registry`. Falls back to an empty array if unavailable so
   * callers always get a list.
   */
  async getRegistry(): Promise<Record<string, any>[]> {
    const raw = await this.client.get("providers:registry");
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? (arr as Record<string, any>[]) : [];
    } catch {
      return [];
    }
  }

  /** Most-recent-first price history for a single (provider, itemId). */
  async getHistory(providerKey: string, itemId: number, limit = 200): Promise<ProviderPriceData[]> {
    const key = `price:history:${providerKey}:${itemId}`;
    const raw = await this.client.zrevrange(key, 0, Math.max(0, limit - 1));
    return raw
      .map((d) => this.safeParse(d))
      .filter((x): x is ProviderPriceData => x !== null);
  }

  /** Price history within a timestamp window (ms). Scores are ts(ms). */
  async getHistoryRange(
    providerKey: string,
    itemId: number,
    fromMs?: number,
    toMs?: number,
    limit = 1000
  ): Promise<ProviderPriceData[]> {
    const key = `price:history:${providerKey}:${itemId}`;
    const max = toMs != null ? toMs : "+inf";
    const min = fromMs != null ? fromMs : "-inf";
    // Most-recent-first within the window, capped at `limit`.
    const raw = await this.client.zrevrangebyscore(key, max, min, "LIMIT", 0, Math.max(1, limit));
    return raw
      .map((d) => this.safeParse(d))
      .filter((x): x is ProviderPriceData => x !== null);
  }

  /** Current snapshot prices for a provider (from the provider SET of keys). */
  async getCurrent(providerKey: string): Promise<ProviderPriceData[]> {
    const keys = await this.client.smembers(`price:current:providers:${providerKey}`);
    if (!keys.length) return [];
    const values = await this.client.mget(...keys);
    return values
      .map((v) => (v ? this.safeParse(v) : null))
      .filter((x): x is ProviderPriceData => x !== null);
  }

  /** Item metadata rows for a provider (keys `item:metadata:{provider}:*`). */
  async getProviderItems(providerKey: string): Promise<ProviderPriceData[]> {
    const keys = await this.client.keys(`item:metadata:${providerKey}:*`);
    if (!keys.length) return [];
    const values = await this.client.mget(...keys);
    return values
      .map((v) => (v ? this.safeParse(v) : null))
      .filter((x): x is ProviderPriceData => x !== null);
  }

  /**
   * The pricing-engine's own arbitrage snapshot (`arbitrage:current`). Read
   * directly so the admin panel still has data when the RabbitMQ fan-out that
   * normally fills the backend cache is unavailable.
   */
  async getArbitrageCurrent<T>(): Promise<T | null> {
    const raw = await this.client.get("arbitrage:current");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** Most-recent-first arbitrage signal history (`arbitrage:history` ZSET). */
  async getArbitrageHistory<T>(limit = 100): Promise<T[]> {
    const raw = await this.client.zrevrange("arbitrage:history", 0, Math.max(0, limit - 1));
    const out: T[] = [];
    for (const entry of raw) {
      try {
        out.push(JSON.parse(entry) as T);
      } catch {
        /* skip malformed history entries */
      }
    }
    return out;
  }

  async isConnected(): Promise<boolean> {
    try {
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  private safeParse(d: string): ProviderPriceData | null {
    try {
      return JSON.parse(d) as ProviderPriceData;
    } catch {
      return null;
    }
  }
}
