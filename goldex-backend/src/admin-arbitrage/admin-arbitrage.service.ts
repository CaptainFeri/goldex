import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PricingRedisService } from '../admin-monitoring/pricing-redis.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { MessagePatterns } from '../rabbitmq/interfaces/rabbitmq.interfaces';
import {
  ArbitrageConfig,
  ArbitrageScanMeta,
  ArbitrageScanResult,
  ArbitrageSignal,
  ArbitrageSource,
  ArbitrageStatus,
} from './arbitrage.types';
import {
  ARBITRAGE_CACHE_TTL_SECONDS,
  ARBITRAGE_KEYS,
  ARBITRAGE_STALE_AFTER_SECONDS,
} from './arbitrage.constants';

const { OPPORTUNITIES_KEY, ALERTS_KEY, SCAN_META_KEY, STATS_KEY } = ARBITRAGE_KEYS;

/**
 * Serves the admin panel's arbitrage views.
 *
 * Primary source is the backend Redis cache filled by `AdminArbitrageConsumer`
 * from the pricing-engine's RabbitMQ stream. When that cache is empty — the
 * broker is down, the engine restarted, the binding hasn't settled — we read
 * the engine's own Redis snapshot directly instead of showing an empty page.
 * Every response says which source answered.
 */
@Injectable()
export class AdminArbitrageService {
  private readonly logger = new Logger(AdminArbitrageService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly pricingRedis: PricingRedisService,
    private readonly rmq: RabbitMQService,
  ) {}

  /** Opportunities from the bus cache, falling back to the engine's snapshot. */
  async getOpportunities(): Promise<ArbitrageSignal[]> {
    const { signals } = await this.resolveSignals();
    // Keep the latest scan's opportunities visible even if an individual quote
    // deadline has already passed; otherwise the page collapses to 0 between
    // scans. The panel renders the deadline so a stale row is still obvious.
    return [...signals].sort((a, b) => (b.profitToman ?? 0) - (a.profitToman ?? 0));
  }

  async getAlerts(): Promise<ArbitrageSignal[]> {
    const alerts = (await this.redis.get(ALERTS_KEY)) as ArbitrageSignal[] | null;
    return alerts ?? [];
  }

  async getLastScan(): Promise<ArbitrageScanMeta | null> {
    const meta = (await this.redis.get(SCAN_META_KEY)) as ArbitrageScanMeta | null;
    if (meta?.scannedAt) return meta;

    const snapshot = await this.readEngineSnapshot();
    if (!snapshot) return null;
    return {
      scannedAt: snapshot.scannedAt,
      trigger: snapshot.trigger,
      totalProviders: snapshot.totalProviders,
      totalItems: snapshot.totalItems,
      bestProfitToman: snapshot.bestProfitToman,
      opportunityCount: snapshot.opportunityCount,
    };
  }

  /** Recently detected signals, most recent first, from the engine's history. */
  async getHistory(limit = 100): Promise<ArbitrageSignal[]> {
    const bounded = Math.min(Math.max(1, limit), 500);
    try {
      return await this.pricingRedis.getArbitrageHistory<ArbitrageSignal>(bounded);
    } catch (err) {
      this.logger.warn(`arbitrage history unavailable: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Why the page looks the way it does: which source answered, how old the data
   * is, and whether the engine is reachable at all. Without this "no
   * opportunities right now" and "nothing is arriving" look identical.
   */
  async getStatus(): Promise<ArbitrageStatus> {
    const { signals, source, meta } = await this.resolveSignals();
    const engineRedisReachable = await this.pingEngine();

    const scannedAt = meta?.scannedAt ?? null;
    const ageSeconds = scannedAt
      ? Math.max(0, Math.round((Date.now() - new Date(scannedAt).getTime()) / 1000))
      : null;
    const stale = ageSeconds === null || ageSeconds > ARBITRAGE_STALE_AFTER_SECONDS;

    let message: string | undefined;
    if (source === 'none') {
      message = engineRedisReachable
        ? 'The pricing-engine is reachable but has not published a scan yet.'
        : 'The pricing-engine Redis is unreachable — no arbitrage data can be read.';
    } else if (source === 'pricing-redis') {
      message =
        'Served from the pricing-engine snapshot — the RabbitMQ arbitrage stream is not arriving.';
    } else if (stale) {
      message = `The last scan is ${ageSeconds}s old; the engine may have stopped scanning.`;
    }

    return {
      source,
      scannedAt,
      ageSeconds,
      staleAfterSeconds: ARBITRAGE_STALE_AFTER_SECONDS,
      stale,
      trigger: meta?.trigger ?? null,
      opportunityCount: meta?.opportunityCount ?? signals.length,
      totalProviders: meta?.totalProviders ?? 0,
      totalItems: meta?.totalItems ?? 0,
      bestProfitToman:
        meta?.bestProfitToman ??
        signals.reduce((max, s) => Math.max(max, s.profitToman ?? 0), 0),
      engineRedisReachable,
      message,
    };
  }

  /** The engine's live scan config, as last reported over `ARBITRAGE_STATS`. */
  async getConfig(): Promise<{ config: ArbitrageConfig | null; reportedAt: string | null; running: boolean | null }> {
    const stats = (await this.redis.get(STATS_KEY)) as
      | { config?: ArbitrageConfig; running?: boolean; reportedAt?: string }
      | null;
    return {
      config: stats?.config ?? null,
      running: stats?.running ?? null,
      reportedAt: stats?.reportedAt ?? null,
    };
  }

  /**
   * Push a config change to the engine. The engine applies it and republishes
   * `ARBITRAGE_STATS`, which the consumer caches — so the panel sees the real
   * applied values rather than what it asked for.
   */
  async updateConfig(partial: Partial<ArbitrageConfig>): Promise<void> {
    await this.rmq.publishCommand(MessagePatterns.ARBITRAGE_COMMAND_CONFIG, partial);
  }

  /** Ask the engine to scan immediately. */
  async requestScan(): Promise<void> {
    await this.rmq.publishCommand(MessagePatterns.ARBITRAGE_COMMAND_SCAN, {});
  }

  /** Ask the engine to republish its stats. */
  async requestStats(): Promise<void> {
    await this.rmq.publishCommand(MessagePatterns.ARBITRAGE_COMMAND_STATS, {});
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async resolveSignals(): Promise<{
    signals: ArbitrageSignal[];
    source: ArbitrageSource;
    meta: ArbitrageScanMeta | null;
  }> {
    const cached = (await this.redis.get(OPPORTUNITIES_KEY)) as ArbitrageSignal[] | null;
    const meta = (await this.redis.get(SCAN_META_KEY)) as ArbitrageScanMeta | null;
    if (Array.isArray(cached) && meta?.scannedAt) {
      return { signals: cached, source: 'bus', meta };
    }

    const snapshot = await this.readEngineSnapshot();
    if (snapshot && Array.isArray(snapshot.signals)) {
      // Warm the cache so the rest of this page load is served locally.
      await this.cacheSnapshot(snapshot);
      return {
        signals: snapshot.signals,
        source: 'pricing-redis',
        meta: {
          scannedAt: snapshot.scannedAt,
          trigger: snapshot.trigger,
          totalProviders: snapshot.totalProviders,
          totalItems: snapshot.totalItems,
          bestProfitToman: snapshot.bestProfitToman,
          opportunityCount: snapshot.opportunityCount ?? snapshot.signals.length,
          source: 'pricing-redis',
        },
      };
    }

    return { signals: cached ?? [], source: 'none', meta };
  }

  private async readEngineSnapshot(): Promise<ArbitrageScanResult | null> {
    try {
      return await this.pricingRedis.getArbitrageCurrent<ArbitrageScanResult>();
    } catch (err) {
      this.logger.warn(`pricing-engine arbitrage snapshot unavailable: ${(err as Error).message}`);
      return null;
    }
  }

  private async cacheSnapshot(snapshot: ArbitrageScanResult): Promise<void> {
    try {
      await this.redis.setWithExpiration(
        OPPORTUNITIES_KEY,
        snapshot.signals,
        ARBITRAGE_CACHE_TTL_SECONDS,
      );
      await this.redis.setWithExpiration(
        SCAN_META_KEY,
        {
          scannedAt: snapshot.scannedAt,
          trigger: snapshot.trigger,
          totalProviders: snapshot.totalProviders,
          totalItems: snapshot.totalItems,
          bestProfitToman: snapshot.bestProfitToman,
          opportunityCount: snapshot.opportunityCount ?? snapshot.signals.length,
          source: 'pricing-redis',
        },
        ARBITRAGE_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(`could not warm the arbitrage cache: ${(err as Error).message}`);
    }
  }

  private async pingEngine(): Promise<boolean> {
    try {
      return await this.pricingRedis.isConnected();
    } catch {
      return false;
    }
  }
}
