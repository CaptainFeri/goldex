import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService, ConfigType } from "@nestjs/config";
import Redis from "ioredis";
import appEnvConfig from "../config/app.env.config";

/**
 * The pricing-engine's Redis layout, as this side reads it.
 *
 * One key per provider per concept, each written whole by the engine. Kept
 * beside the engine's own `src/redis/keys.ts`; the two are one contract across
 * two repositories, so a change to either has to be a change to both.
 */
const providerItemsKey = (providerKey: string) => `provider:${providerKey}:items`;
const providerPricesKey = (providerKey: string) => `provider:${providerKey}:prices`;
const providerHistoryKey = (providerKey: string, itemId: number) =>
  `provider:${providerKey}:history:${itemId}`;
const ACTIVE_PROVIDERS_KEY = "providers:active";

// Shape of each history record as written by the pricing-engine
// (`provider:{provider}:history:{itemId}` ZSET members).
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

  /**
   * Provider keys that currently have data.
   *
   * Read from the engine's index and then checked, rather than scanned for.
   * The old path listed providers by a set the engine never pruned, so a
   * provider that had been off for weeks still counted as reporting — and the
   * panel showed it green. A provider is in this list when it holds either a
   * symbol list or prices inside the data lifetime.
   */
  async getProviders(): Promise<string[]> {
    const named = await this.client.smembers(ACTIVE_PROVIDERS_KEY);
    if (!named.length) return [];

    const pipeline = this.client.pipeline();
    for (const key of named) {
      pipeline.exists(providerPricesKey(key));
      pipeline.exists(providerItemsKey(key));
    }
    const results = await pipeline.exec();

    // Either half counts. Symbols and prices reach the engine by different
    // routes and fail independently — a provider whose shop is closed has a
    // published symbol list and no quotes — and requiring both hid it.
    return named
      .filter((_, i) => Boolean(results?.[i * 2]?.[1]) || Boolean(results?.[i * 2 + 1]?.[1]))
      .sort();
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

  /**
   * Whether the pricing-engine has an outbound proxy configured at all, key
   * `engine:proxy`.
   *
   * Only that process knows — the proxy is its environment, not this one's. A
   * provider's `useProxy` does nothing without it, so the panel shows this
   * rather than letting an admin tick a box that cannot take effect. Unknown
   * when the engine has not published yet, which is not the same as "no".
   */
  async getProxyConfigured(): Promise<boolean | null> {
    const raw = await this.client.get("engine:proxy");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { configured?: unknown };
      return typeof parsed?.configured === "boolean" ? parsed.configured : null;
    } catch {
      return null;
    }
  }

  /** Most-recent-first price history for a single (provider, itemId). */
  async getHistory(providerKey: string, itemId: number, limit = 200): Promise<ProviderPriceData[]> {
    const key = providerHistoryKey(providerKey, itemId);
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
    const key = providerHistoryKey(providerKey, itemId);
    const max = toMs != null ? toMs : "+inf";
    const min = fromMs != null ? fromMs : "-inf";
    // Most-recent-first within the window, capped at `limit`.
    const raw = await this.client.zrevrangebyscore(key, max, min, "LIMIT", 0, Math.max(1, limit));
    return raw
      .map((d) => this.safeParse(d))
      .filter((x): x is ProviderPriceData => x !== null);
  }

  /** A provider's latest price per item, in one round trip. */
  async getCurrent(providerKey: string): Promise<ProviderPriceData[]> {
    const entries = await this.client.hgetall(providerPricesKey(providerKey));
    return Object.values(entries)
      .map((v) => this.safeParse(v))
      .filter((x): x is ProviderPriceData => x !== null);
  }

  /**
   * The symbols a provider offers.
   *
   * One hash the engine replaces whole, so this is always a set the provider
   * actually offered at some single moment. It used to be a `KEYS` sweep over
   * one key per item — a blocking scan of the whole keyspace, run on every
   * page load of the snapshot tab, returning a list that had been decaying an
   * item at a time as the individual keys expired.
   */
  async getProviderItems(providerKey: string): Promise<ProviderPriceData[]> {
    const entries = await this.client.hgetall(providerItemsKey(providerKey));
    return Object.values(entries)
      .map((v) => this.safeParse(v))
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
