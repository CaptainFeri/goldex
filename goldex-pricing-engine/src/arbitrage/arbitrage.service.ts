import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { PriceData, RedisService } from '../redis/redis.service';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import { RabbitMQService, MessagePatterns } from '../rabbitmq/rabbitmq.module';
import {
  ArbitrageConfig,
  ArbitrageLeg,
  ArbitrageScanResult,
  ArbitrageSignal,
  ArbitrageStats,
} from './types/arbitrage-signal.type';

interface GroupedItem {
  itemId: number;
  itemName: string;
  groupId: number;
  groupName: string;
  unit: string;
  prices: PriceData[];
}

const LABEL = 'Arbitrage';

const DEFAULT_CONFIG: ArbitrageConfig = {
  minProfitToman: 1,
  minProfitPercent: 0,
  maxSignals: 100,
  quoteFreshnessMs: 60_000,
  signalTtlMs: 30_000,
  scanIntervalMs: 10_000,
  recomputeDebounceMs: 400,
};

/**
 * Real-time arbitrage engine.
 *
 * Mirrors the architecture of the real-time provider module: it reacts to the
 * `price:updates` Redis pub/sub stream (debounced), keeps a safety-net interval
 * scan, persists results to Redis (current snapshot + capped history), and
 * fans signals out over an internal EventEmitter, Redis pub/sub, and RabbitMQ.
 */
@Injectable()
export class ArbitrageService implements OnModuleInit, OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private config: ArbitrageConfig = { ...DEFAULT_CONFIG };

  private unsubscribePrices: (() => void) | null = null;
  private scanTimer: NodeJS.Timeout | null = null;
  private recomputeTimer: NodeJS.Timeout | null = null;
  private scanning = false;
  private pendingRescan = false;

  private lastResult: ArbitrageScanResult | null = null;
  private previousSignalKeys = new Set<string>();

  private totalScans = 0;
  private totalSignalsDetected = 0;

  constructor(
    private readonly redisService: RedisService,
    private readonly formatter: ConsoleFormatterService,
    private readonly rabbitMQService?: RabbitMQService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      this.unsubscribePrices = await this.redisService.subscribeToPriceUpdates(() =>
        this.scheduleRecompute(),
      );
    } catch (error) {
      this.formatter.error(LABEL, `Failed to subscribe to price updates: ${this.msg(error)}`);
    }

    this.scanTimer = setInterval(() => {
      void this.scanAndBroadcast('interval');
    }, this.config.scanIntervalMs);

    this.formatter.log(
      LABEL,
      `Engine started (interval ${this.config.scanIntervalMs}ms, debounce ${this.config.recomputeDebounceMs}ms)`,
    );

    await this.scanAndBroadcast('startup');
  }

  onModuleDestroy(): void {
    if (this.unsubscribePrices) {
      this.unsubscribePrices();
      this.unsubscribePrices = null;
    }
    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.recomputeTimer) clearTimeout(this.recomputeTimer);
    this.scanTimer = null;
    this.recomputeTimer = null;
  }

  /** Subscribe to freshly detected arbitrage signals (new opportunities only). */
  onArbitrageSignal(callback: (signal: ArbitrageSignal) => void): void {
    this.emitter.on('arbitrageSignal', callback);
  }

  /** Subscribe to every completed scan. */
  onScan(callback: (result: ArbitrageScanResult) => void): void {
    this.emitter.on('scan', callback);
  }

  getConfig(): ArbitrageConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<ArbitrageConfig>): ArbitrageConfig {
    this.config = { ...this.config, ...partial };

    if (partial.scanIntervalMs !== undefined && this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = setInterval(() => {
        void this.scanAndBroadcast('interval');
      }, this.config.scanIntervalMs);
    }

    this.formatter.log(LABEL, `Config updated: ${JSON.stringify(partial)}`);
    return this.getConfig();
  }

  getStats(): ArbitrageStats {
    return {
      running: this.scanTimer !== null,
      lastScanAt: this.lastResult?.scannedAt ?? null,
      lastTrigger: this.lastResult?.trigger ?? null,
      lastSignalCount: this.lastResult?.signals.length ?? 0,
      totalScans: this.totalScans,
      totalSignalsDetected: this.totalSignalsDetected,
      providersTracked: this.lastResult?.totalProviders ?? 0,
      itemsTracked: this.lastResult?.totalItems ?? 0,
      config: this.getConfig(),
    };
  }

  /** Last computed result, falling back to the persisted Redis snapshot. */
  async getCurrent(): Promise<ArbitrageScanResult | null> {
    if (this.lastResult) return this.lastResult;
    return this.redisService.getArbitrageScan<ArbitrageScanResult>();
  }

  async getHistory(limit = 100): Promise<ArbitrageSignal[]> {
    return this.redisService.getArbitrageHistory<ArbitrageSignal>(limit);
  }

  /** On-demand scan (e.g. from the controller); broadcasts like any other. */
  async scanNow(): Promise<ArbitrageScanResult> {
    return this.scanAndBroadcast('manual');
  }

  // ── Real-time recompute (debounced) ──────────────────────────────────────

  private scheduleRecompute(): void {
    if (this.recomputeTimer) return;
    this.recomputeTimer = setTimeout(() => {
      this.recomputeTimer = null;
      void this.scanAndBroadcast('realtime');
    }, this.config.recomputeDebounceMs);
  }

  private async scanAndBroadcast(
    trigger: ArbitrageScanResult['trigger'],
  ): Promise<ArbitrageScanResult> {
    // Never run two scans concurrently; coalesce the request instead.
    if (this.scanning) {
      this.pendingRescan = true;
      return this.lastResult ?? this.emptyResult(trigger);
    }

    this.scanning = true;
    try {
      const result = await this.scan(trigger);
      this.lastResult = result;
      this.totalScans++;
      await this.broadcast(result);
      return result;
    } catch (error) {
      this.formatter.error(LABEL, `Scan failed: ${this.msg(error)}`);
      return this.lastResult ?? this.emptyResult(trigger);
    } finally {
      this.scanning = false;
      if (this.pendingRescan) {
        this.pendingRescan = false;
        this.scheduleRecompute();
      }
    }
  }

  // ── Core matching ────────────────────────────────────────────────────────

  private async scan(trigger: ArbitrageScanResult['trigger']): Promise<ArbitrageScanResult> {
    const allPrices = await this.redisService.getAllCurrentPrices();
    const now = Date.now();

    const providerSet = new Set<string>();
    const itemMap = new Map<number, GroupedItem>();

    for (const price of allPrices) {
      if (!price.providerKey) continue;

      // Ignore stale quotes — an arbitrage on a price nobody is honouring is noise.
      const ts = new Date(price.timestamp).getTime();
      if (!isNaN(ts) && now - ts > this.config.quoteFreshnessMs) continue;

      providerSet.add(price.providerKey);

      let group = itemMap.get(price.itemId);
      if (!group) {
        group = {
          itemId: price.itemId,
          itemName: price.itemName ?? `Item #${price.itemId}`,
          groupId: price.groupId ?? 0,
          groupName: price.groupName ?? '',
          unit: price.unit ?? '',
          prices: [],
        };
        itemMap.set(price.itemId, group);
      }
      group.prices.push(price);
    }

    const signals: ArbitrageSignal[] = [];
    for (const group of itemMap.values()) {
      const signal = this.bestSignalForItem(group);
      if (signal) signals.push(signal);
    }

    signals.sort((a, b) => b.profitToman - a.profitToman);
    const top = signals.slice(0, this.config.maxSignals);

    return {
      signals: top,
      scannedAt: new Date().toISOString(),
      trigger,
      totalProviders: providerSet.size,
      totalItems: itemMap.size,
      opportunityCount: signals.length,
      bestProfitToman: top.length > 0 ? top[0].profitToman : 0,
    };
  }

  /**
   * For a single item across providers, the optimal spatial arbitrage is always
   * "buy where it's cheapest (lowest sell price), sell where it's dearest
   * (highest buy price)". No multi-leg chain on one item beats that pair.
   */
  private bestSignalForItem(group: GroupedItem): ArbitrageSignal | null {
    let bestBuy: PriceData | null = null; // lowest sellPrice (we buy from them)
    let bestSell: PriceData | null = null; // highest buyPrice (we sell to them)

    for (const p of group.prices) {
      if (p.canSell && p.sellPrice > 0 && (!bestBuy || p.sellPrice < bestBuy.sellPrice)) {
        bestBuy = p;
      }
      if (p.canBuy && p.buyPrice > 0 && (!bestSell || p.buyPrice > bestSell.buyPrice)) {
        bestSell = p;
      }
    }

    if (!bestBuy || !bestSell) return null;
    if (bestBuy.providerKey === bestSell.providerKey) return null;

    const profitToman = bestSell.buyPrice - bestBuy.sellPrice;
    if (profitToman <= 0) return null;

    const profitPercent = bestBuy.sellPrice > 0 ? (profitToman / bestBuy.sellPrice) * 100 : 0;
    if (profitToman < this.config.minProfitToman) return null;
    if (profitPercent < this.config.minProfitPercent) return null;

    const deadline = this.computeDeadline([bestBuy.timestamp, bestSell.timestamp]);
    if (deadline && new Date(deadline).getTime() <= Date.now()) return null;

    const goldPriceRef = bestBuy.sellPricePerGram ?? bestBuy.sellPrice;
    const profitGold = goldPriceRef > 0 ? profitToman / goldPriceRef : 0;

    const buyLeg: ArbitrageLeg = {
      providerKey: bestBuy.providerKey,
      itemId: group.itemId,
      action: 'buy',
      price: bestBuy.sellPrice,
      priceStr: bestBuy.sellPriceStr,
      timestamp: bestBuy.timestamp,
    };
    const sellLeg: ArbitrageLeg = {
      providerKey: bestSell.providerKey,
      itemId: group.itemId,
      action: 'sell',
      price: bestSell.buyPrice,
      priceStr: bestSell.buyPriceStr,
      timestamp: bestSell.timestamp,
    };

    return {
      id: uuid(),
      key: `${group.itemId}:${buyLeg.providerKey}->${sellLeg.providerKey}`,
      itemId: group.itemId,
      itemName: group.itemName,
      groupId: group.groupId,
      groupName: group.groupName,
      unit: group.unit,
      buyLeg,
      sellLeg,
      legs: [buyLeg, sellLeg],
      profitToman,
      profitPercent,
      profitGold,
      goldPriceRef,
      deadline: deadline ?? new Date(Date.now() + this.config.signalTtlMs).toISOString(),
      detectedAt: new Date().toISOString(),
    };
  }

  private computeDeadline(timestamps: string[]): string | null {
    const times = timestamps.map((t) => new Date(t).getTime()).filter((t) => !isNaN(t));
    if (times.length === 0) return null;
    const oldest = Math.min(...times);
    return new Date(oldest + this.config.signalTtlMs).toISOString();
  }

  // ── Persistence + fan-out ────────────────────────────────────────────────

  private async broadcast(result: ArbitrageScanResult): Promise<void> {
    this.totalSignalsDetected += result.signals.length;

    await this.redisService.setArbitrageScan(result, Math.ceil(this.config.signalTtlMs / 1000) * 4);
    await this.redisService.addArbitrageHistory(result.signals);
    await this.redisService.publishArbitrageUpdate(result);

    this.emitter.emit('scan', result);

    // Only fan out signals that weren't present in the previous scan, so
    // downstream consumers aren't spammed with the same standing opportunity.
    const currentKeys = new Set<string>();
    const fresh: ArbitrageSignal[] = [];
    for (const signal of result.signals) {
      currentKeys.add(signal.key);
      if (!this.previousSignalKeys.has(signal.key)) fresh.push(signal);
    }
    this.previousSignalKeys = currentKeys;

    for (const signal of fresh) {
      this.emitter.emit('arbitrageSignal', signal);
    }

    if (this.rabbitMQService) {
      await this.rabbitMQService.publish(MessagePatterns.ARBITRAGE_SCAN, result);
      for (const signal of fresh) {
        await this.rabbitMQService.publish(MessagePatterns.ARBITRAGE_SIGNAL, signal);
      }
    }

    if (fresh.length > 0) {
      const top = fresh[0];
      this.formatter.log(
        LABEL,
        `💹 ${fresh.length} new opportunit${fresh.length === 1 ? 'y' : 'ies'} ` +
          `(top: ${top.itemName} ${top.buyLeg.providerKey}→${top.sellLeg.providerKey} ` +
          `+${top.profitToman.toLocaleString('en-US')} تومان / ${top.profitPercent.toFixed(2)}%)`,
      );
    }
  }

  private emptyResult(trigger: ArbitrageScanResult['trigger']): ArbitrageScanResult {
    return {
      signals: [],
      scannedAt: new Date().toISOString(),
      trigger,
      totalProviders: 0,
      totalItems: 0,
      opportunityCount: 0,
      bestProfitToman: 0,
    };
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
