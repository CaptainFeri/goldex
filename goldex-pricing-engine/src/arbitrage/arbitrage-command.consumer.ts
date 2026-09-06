import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ArbitrageService } from './arbitrage.service';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import { RabbitMQService, MessagePatterns } from '../rabbitmq/rabbitmq.module';
import { ArbitrageConfig } from './types/arbitrage-signal.type';

const LABEL = 'Arbitrage';

/** Config fields the backend is allowed to change, with their sane bounds. */
const CONFIG_BOUNDS: Record<keyof ArbitrageConfig, { min: number; max: number }> = {
  minProfitRial: { min: 0, max: Number.MAX_SAFE_INTEGER },
  minProfitPercent: { min: 0, max: 100 },
  maxSignals: { min: 1, max: 1000 },
  quoteFreshnessMs: { min: 1_000, max: 600_000 },
  signalTtlMs: { min: 1_000, max: 600_000 },
  scanIntervalMs: { min: 1_000, max: 600_000 },
  recomputeDebounceMs: { min: 0, max: 10_000 },
};

/**
 * Consumes backend -> engine arbitrage commands on the dedicated command queue:
 * read/patch the scan config and trigger an on-demand scan. Every command
 * answers by publishing `ARBITRAGE_STATS` on the shared stream, so the admin
 * panel always sees the values the engine actually applied rather than the
 * ones it asked for.
 */
@Injectable()
export class ArbitrageCommandConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(ArbitrageCommandConsumer.name);

  constructor(
    private readonly arbitrage: ArbitrageService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly formatter: ConsoleFormatterService,
  ) {}

  onApplicationBootstrap(): void {
    void this.subscribe();
  }

  private async subscribe(): Promise<void> {
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.ARBITRAGE_COMMAND_CONFIG,
      (msg) => void this.handleConfig(msg),
    );
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.ARBITRAGE_COMMAND_SCAN,
      () => void this.handleScan(),
    );
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.ARBITRAGE_COMMAND_STATS,
      () => void this.publishStats(),
    );
    this.formatter.log(LABEL, 'Subscribed to arbitrage commands');
    // Publish once on boot so the panel has the engine's config without
    // anyone having to ask for it first.
    await this.publishStats();
  }

  private async handleConfig(msg: { data?: unknown }): Promise<void> {
    try {
      const partial = this.sanitize(msg?.data);
      if (Object.keys(partial).length === 0) {
        this.logger.warn('arbitrage.command.config carried no usable fields');
      } else {
        this.arbitrage.updateConfig(partial);
      }
      await this.publishStats();
    } catch (err) {
      this.logger.error(`arbitrage.command.config failed: ${this.err(err)}`);
    }
  }

  private async handleScan(): Promise<void> {
    try {
      await this.arbitrage.scanNow();
      await this.publishStats();
    } catch (err) {
      this.logger.error(`arbitrage.command.scan failed: ${this.err(err)}`);
    }
  }

  private async publishStats(): Promise<void> {
    try {
      await this.rabbitMQService.publish(MessagePatterns.ARBITRAGE_STATS, {
        ...this.arbitrage.getStats(),
        reportedAt: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.error(`arbitrage stats publish failed: ${this.err(err)}`);
    }
  }

  /**
   * Only known numeric fields within bounds survive. A command carrying a
   * nonsense scan interval must not be able to stall or thrash the engine.
   */
  private sanitize(data: unknown): Partial<ArbitrageConfig> {
    if (!data || typeof data !== 'object') return {};
    const input = data as Record<string, unknown>;
    const out: Partial<ArbitrageConfig> = {};

    for (const [field, bounds] of Object.entries(CONFIG_BOUNDS)) {
      const raw = input[field];
      if (raw === undefined || raw === null) continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        this.logger.warn(`arbitrage config: ignoring non-numeric ${field}`);
        continue;
      }
      if (value < bounds.min || value > bounds.max) {
        this.logger.warn(
          `arbitrage config: ignoring ${field}=${value} (allowed ${bounds.min}..${bounds.max})`,
        );
        continue;
      }
      out[field as keyof ArbitrageConfig] = value;
    }

    return out;
  }

  private err(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
