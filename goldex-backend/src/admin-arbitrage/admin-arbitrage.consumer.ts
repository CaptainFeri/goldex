import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import {
  MessagePatterns,
  RabbitMQMessage,
} from '../rabbitmq/interfaces/rabbitmq.interfaces';
import { RedisService } from '../redis/redis.service';
import { ArbitrageSignal, ArbitrageScanResult } from './arbitrage.types';

const OPPORTUNITIES_KEY = 'arbitrage:opportunities';
const ALERTS_KEY = 'arbitrage:alerts';
const SCAN_META_KEY = 'arbitrage:last-scan';
const MAX_ALERTS = 50;

/**
 * Consumes arbitrage signals published by the pricing-engine and caches them
 * in the backend Redis for the admin panel. `ARBITRAGE_SCAN` carries the full
 * current set of opportunities; `ARBITRAGE_SIGNAL` carries only freshly
 * detected ones and feeds the "alerts" list.
 */
@Injectable()
export class AdminArbitrageConsumer implements OnModuleInit {
  private readonly logger = new Logger(AdminArbitrageConsumer.name);

  constructor(
    private readonly rmq: RabbitMQService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    this.rmq.subscribe(MessagePatterns.ARBITRAGE_SCAN, (m) => void this.onScan(m));
    this.rmq.subscribe(MessagePatterns.ARBITRAGE_SIGNAL, (m) => void this.onSignal(m));
  }

  private async onScan(msg: RabbitMQMessage): Promise<void> {
    try {
      const scan = msg.data as ArbitrageScanResult;
      if (!scan || !Array.isArray(scan.signals)) return;

      await this.redis.setWithExpiration(OPPORTUNITIES_KEY, scan.signals, 3600);
      await this.redis.setWithExpiration(
        SCAN_META_KEY,
        {
          scannedAt: scan.scannedAt,
          trigger: scan.trigger,
          totalProviders: scan.totalProviders,
          totalItems: scan.totalItems,
          bestProfitToman: scan.bestProfitToman,
        },
        3600,
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
        3600,
      );
    } catch (err) {
      this.logger.error(`arbitrage alert store failed: ${(err as Error).message}`);
    }
  }
}
