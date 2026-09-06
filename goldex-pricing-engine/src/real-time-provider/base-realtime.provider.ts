import { OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import { IRealtimePriceProvider, ProviderConfig } from './interfaces/realtime-provider.interface';
import { PriceData, RedisService } from '../redis/redis.service';
import { ItemMetadata, ItemMetadataService } from './item-metadata.service';
import { RabbitMQService, MessagePatterns } from '../rabbitmq/rabbitmq.module';
import { ItemUnit } from './types';
import { CurrencyUnit, formatRial, resolvePriceUnit, toRial } from '../common/currency-unit';

export abstract class BaseRealtimeProvider implements IRealtimePriceProvider, OnModuleDestroy {
  protected formatter!: ConsoleFormatterService;
  config!: ProviderConfig;
  protected connected = false;
  protected stopped = false;
  protected eventEmitter = new EventEmitter();
  protected reconnectAttempts = 0;
  protected maxReconnect = 10;
  protected reconnectDelay = 3000;
  protected reconnectTimer: NodeJS.Timeout | null = null;
  protected trackedItemIds: Set<number> = new Set();
  private updateCount = 0;
  private lastLogTime = 0;

  constructor(
    protected readonly redisService: RedisService,
    protected readonly metadataService: ItemMetadataService,
    protected readonly rabbitMQService?: RabbitMQService,
  ) {}

  get providerLabel(): string {
    return this.config ? `${this.config.category.toUpperCase()}:${this.config.key}` : 'PROVIDER';
  }

  async init(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.stopped = false;
  }

  setFormatter(formatter: ConsoleFormatterService): void {
    this.formatter = formatter;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract isConnected(): boolean;
  abstract getShopProfile(): Promise<any>;
  abstract getPrice(itemId: number): Promise<PriceData | null>;
  abstract getDealView(itemId: number, dealType?: number): Promise<any>;
  protected abstract setupSocketListeners(): void;
  protected abstract authenticate(): Promise<string | void>;

  onPriceUpdate(callback: (data: PriceData) => void): void {
    this.eventEmitter.on('priceUpdate', callback);
  }

  protected async emitPriceUpdate(priceData: PriceData): Promise<void> {
    priceData.providerKey = this.config.key;

    if (priceData.buyPrice <= 0) {
      priceData.canBuy = false;
      priceData.buyPrice = 0;
      priceData.buyPriceStr = '0';
    }
    if (priceData.sellPrice <= 0) {
      priceData.canSell = false;
      priceData.sellPrice = 0;
      priceData.sellPriceStr = '0';
    }

    this.normalizePrices(priceData);
    this.convertToRial(priceData);
    const enriched = await this.metadataService.enrichPriceData(priceData);

    if (enriched.unit === ItemUnit.GRAM || enriched.groupId === 1) {
      const mithqalToGram = 4.3318;
      enriched.buyPricePerGram = enriched.buyPrice / mithqalToGram;
      enriched.sellPricePerGram = enriched.sellPrice / mithqalToGram;
      enriched.buyPricePerGramStr = formatRial(enriched.buyPricePerGram);
      enriched.sellPricePerGramStr = formatRial(enriched.sellPricePerGram);
    } else {
      enriched.buyPricePerGram = undefined;
      enriched.sellPricePerGram = undefined;
    }

    enriched.spread = enriched.sellPrice - enriched.buyPrice;
    enriched.spreadPercent =
      enriched.buyPrice > 0 ? (enriched.spread / enriched.buyPrice) * 100 : 0;

    this.eventEmitter.emit('priceUpdate', enriched);
    await this.redisService.setCurrentPrice(this.config.key, enriched.itemId, enriched);
    await this.redisService.addPriceToHistory(this.config.key, enriched.itemId, enriched);
    await this.redisService.publishPriceUpdate(enriched);
    if (this.rabbitMQService) {
      await this.rabbitMQService.publish(MessagePatterns.PRICE_UPDATE, enriched, this.config.key);
    }

    this.updateCount++;
    const now = Date.now();
    if (now - this.lastLogTime >= 5000) {
      this.formatter.log(this.providerLabel, `📊 ${this.updateCount} updates`);
      this.updateCount = 0;
      this.lastLogTime = now;
    }
  }

  /**
   * Brings the quote onto the system's single currency: Rial. A provider that
   * publishes Toman is scaled by ten here, once, before the quote is cached,
   * broadcast or scanned for arbitrage — so no consumer has to know or ask
   * which unit a given provider speaks in.
   *
   * The display strings are rebuilt rather than passed through, because the
   * provider's own string still says what it quoted.
   */
  private convertToRial(data: PriceData): void {
    const sourceUnit = resolvePriceUnit(this.config?.priceUnit);
    data.sourcePriceUnit = sourceUnit;
    data.priceUnit = CurrencyUnit.RIAL;

    if (sourceUnit === CurrencyUnit.RIAL) return;

    data.buyPrice = toRial(data.buyPrice, sourceUnit);
    data.sellPrice = toRial(data.sellPrice, sourceUnit);
    data.buyPriceStr = formatRial(data.buyPrice);
    data.sellPriceStr = formatRial(data.sellPrice);
  }

  private normalizePrices(data: PriceData): void {
    if (data.buyPrice > data.sellPrice && data.sellPrice > 0) {
      const tmpBuy = data.buyPrice;
      const tmpBuyStr = data.buyPriceStr;
      const tmpCanBuy = data.canBuy;
      data.buyPrice = data.sellPrice;
      data.buyPriceStr = data.sellPriceStr;
      data.canBuy = data.canSell;
      data.sellPrice = tmpBuy;
      data.sellPriceStr = tmpBuyStr;
      data.canSell = tmpCanBuy;
    }
  }

  protected async updateTrackedItems(metadataItems: ItemMetadata[]): Promise<void> {
    this.trackedItemIds.clear();
    for (const item of metadataItems) {
      this.trackedItemIds.add(item.itemId);
    }
    this.formatter.log(this.providerLabel, `Now tracking ${this.trackedItemIds.size} items`);
  }

  protected shouldTrackItem(itemId: number): boolean {
    return this.trackedItemIds.size === 0 || this.trackedItemIds.has(itemId);
  }

  protected handleDisconnect(): void {
    this.connected = false;
    if (this.stopped) return;
    this.formatter.warn(this.providerLabel, 'Connection lost – scheduling reconnection');
    this.formatter.printConnectionEvent(this.providerLabel, 'reconnecting', {
      attempt: this.reconnectAttempts + 1,
    });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnect) {
      this.formatter.error(this.providerLabel, 'Max reconnection attempts reached');
      return;
    }
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => {
      if (this.stopped) return;
      this.reconnectAttempts++;
      this.connect()
        .then(() => {
          this.reconnectAttempts = 0;
          this.formatter.printConnectionEvent(this.providerLabel, 'connected');
        })
        .catch(() => {
          if (this.stopped) return;
          this.formatter.error(
            this.providerLabel,
            `Reconnect attempt ${this.reconnectAttempts} failed`,
          );
          this.scheduleReconnect();
        });
    }, delay);
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.disconnect();
  }

  onModuleDestroy(): void {
    this.stop();
  }
}
