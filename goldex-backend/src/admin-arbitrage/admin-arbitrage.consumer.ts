import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import {
  MessagePatterns,
  RabbitMQMessage,
} from '../rabbitmq/interfaces/rabbitmq.interfaces';
import { RedisService } from '../redis/redis.service';
import { ArbitrageSignal, ArbitrageScanResult } from './arbitrage.types';
import { ARBITRAGE_KEYS, ARBITRAGE_CACHE_TTL_SECONDS } from './arbitrage.constants';

const { OPPORTUNITIES_KEY, ALERTS_KEY, SCAN_META_KEY, STATS_KEY } = ARBITRAGE_KEYS;
const MAX_ALERTS = 50;

/**
 * Consumes arbitrage signals published by the pricing-engine and caches them
 * in the backend Redis for the admin panel. `ARBITRAGE_SCAN` carries the full
 * current set of opportunities; `ARBITRAGE_SIGNAL` carries only freshly
 * detected ones and feeds the "alerts" list; `ARBITRAGE_STATS` carries the
 * engine's own view of itself (running state and live config).
 */
@Injectable()
export class AdminArbitrageConsumer implements OnModuleInit {
  private readonly logger = new Logger(AdminArbitrageConsumer.name);

  constructor(
    private readonly rmq: RabbitMQService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rmq.subscribe(MessagePatterns.ARBITRAGE_SCAN, (m) => void this.onScan(m));
    await this.rmq.subscribe(MessagePatterns.ARBITRAGE_SIGNAL, (m) => void this.onSignal(m));
    await this.rmq.subscribe(MessagePatterns.ARBITRAGE_STATS, (m) => void this.onStats(m));
    // Bind now rather than relying on another module calling startConsuming()
    // after we registered — otherwise the binding is a race and the arbitrage
    // stream silently never arrives.
    await this.rmq.startConsuming();
  }

  private async onScan(msg: RabbitMQMessage): Promise<void> {
    try {
      const scan = msg.data as ArbitrageScanResult;
      if (!scan || !Array.isArray(scan.signals)) return;

      await this.redis.setWithExpiration(OPPORTUNITIES_KEY, scan.signals, ARBITRAGE_CACHE_TTL_SECONDS);
      await this.redis.setWithExpiration(
        SCAN_META_KEY,
        {
          scannedAt: scan.scannedAt,
          trigger: scan.trigger,
          totalProviders: scan.totalProviders,
          totalItems: scan.totalItems,
          bestProfitRial: scan.bestProfitRial,
          opportunityCount: scan.opportunityCount ?? scan.signals.length,
          source: 'bus',
        },
        ARBITRAGE_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.error(`arbitrage scan store failed: ${(err as Error).message}`);
    }
  }

  private async onSignal(msg: RabbitMQMessage): Promise<void> {
    try {
      const signal = msg.data as ArbitrageSignal;
      if (!signal?.key) return;

      const existing = (await this.redis.get(ALERTS_KEY)) as ArbitrageSignal[] | null;
      const alerts = existing ?? [];
      // De-dupe by signal key; newest first.
      const filtered = alerts.filter((a) => a.key !== signal.key);
      filtered.unshift(signal);
      await this.redis.setWithExpiration(
        ALERTS_KEY,
        filtered.slice(0, MAX_ALERTS),
        ARBITRAGE_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.error(`arbitrage alert store failed: ${(err as Error).message}`);
    }
  }

  /**
   * The engine answers `ARBITRAGE_COMMAND_STATS` (and echoes after a config
   * change) on this pattern. Cached so `GET /admin/arbitrage/config` can serve
   * the engine's live values instead of a guess.
   */
  private async onStats(msg: RabbitMQMessage): Promise<void> {
    try {
      const stats = msg.data;
      if (!stats || typeof stats !== 'object') return;
      await this.redis.setWithExpiration(STATS_KEY, stats, ARBITRAGE_CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.error(`arbitrage stats store failed: ${(err as Error).message}`);
    }
  }
}
