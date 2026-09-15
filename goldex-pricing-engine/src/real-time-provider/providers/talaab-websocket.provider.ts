import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import WebSocket from 'ws';
import { firstValueFrom } from 'rxjs';
import { ConsoleFormatterService } from '../../common/console-formatter.service';
import { BaseRealtimeProvider } from '../base-realtime.provider';
import { RedisService, PriceData } from '../../redis/redis.service';
import { ItemMetadataService, ItemMetadata } from '../item-metadata.service';
import { RabbitMQService, MessagePatterns } from '../../rabbitmq/rabbitmq.module';
import { TalaabPricingCurrency, TalaabFeaturesData } from '../types/talaab.types';
import { readPusherFrame } from './pusher-frames';
import { buildWebSocketAgent } from '../../common/http/proxy.config';

@Injectable()
export class TalaAbWebSocketProvider extends BaseRealtimeProvider {
  private ws: WebSocket | null = null;
  private socketId: string | null = null;
  private authToken = '';
  private wsUrl = '';
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private metadataRefreshInterval: NodeJS.Timeout | null = null;

  private readonly silverItemIds = new Set([25, 28]);

  /** Set only once the server has answered the subscribe frame. */
  private subscribed = false;
  private pricingFrames = 0;
  private silenceTimer: NodeJS.Timeout | null = null;
  private loggedHomeDataShape = false;
  private loggedHomepageShape = false;

  /** How long a subscribed, open shop may stay silent before the log says so. */
  private readonly silenceWarningMs = 120000;

  constructor(
    private readonly httpService: HttpService,
    redisService: RedisService,
    metadataService: ItemMetadataService,
    formatter: ConsoleFormatterService,
    rabbitMQService?: RabbitMQService,
  ) {
    super(redisService, metadataService, rabbitMQService);
    this.setFormatter(formatter);
  }

  async connect(): Promise<void> {
    if (this.stopped) return;
    this.formatter.log(
      this.providerLabel,
      `Connecting TalaAb (Pusher) provider: ${this.config.key}`,
    );
    this.formatter.printConnectionEvent(this.providerLabel, 'connecting');
    this.authToken = this.config.auth['token'];
    this.wsUrl = this.config.baseUrl;

    await this.fetchAndStoreMetadata();
    this.startMetadataRefresh();
    await this.establishWebSocket();
    this.setupKeepAlive();
    this.connected = true;
    this.formatter.printConnectionEvent(this.providerLabel, 'connected');

    await this.waitForShopOpen();
  }

  disconnect(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.metadataRefreshInterval) clearInterval(this.metadataRefreshInterval);
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  async getShopProfile(): Promise<any> {
    const apiBaseUrl = this.config.apiBaseUrl || this.config.auth['apiBaseUrl'];
    if (!apiBaseUrl) {
      throw new Error('apiBaseUrl is required for TalaAb provider');
    }
    const url = `${apiBaseUrl}`;
    const response = await firstValueFrom(
      this.httpService.get(url, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          Accept: 'application/json',
        },
      }),
    );
    return response.data;
  }

  async getPrice(itemId: number): Promise<PriceData | null> {
    return this.redisService.getCurrentPrice(this.config.key, itemId);
  }

  async getDealView(_itemId: number, _dealType = 0): Promise<any> {
    throw new Error('Deal view not implemented for TalaAb');
  }

  protected setupSocketListeners(): void {
    if (!this.ws) return;
    this.ws.on('message', (data: Buffer) => this.handleWebSocketMessage(data.toString()));
    this.ws.on('close', () => this.handleDisconnect());
    this.ws.on('error', (err) =>
      this.formatter.error(this.providerLabel, `WebSocket error: ${err.message}`),
    );
  }

  protected async authenticate(): Promise<string> {
    return this.authToken;
  }

  private startMetadataRefresh(): void {
    const interval = this.config.metadataRefreshIntervalMs || 10 * 60 * 1000;
    this.metadataRefreshInterval = setInterval(() => {
      this.refreshMetadata().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.formatter.error(this.providerLabel, `Metadata refresh failed: ${message}`);
      });
    }, interval);
    this.formatter.log(this.providerLabel, `Metadata refresh scheduled every ${interval / 1000}s`);
  }

  private async refreshMetadata(): Promise<void> {
    this.formatter.debug(this.providerLabel, 'Refreshing metadata...');
    const newMetadata = await this.fetchMetadataFromApi();
    if (newMetadata.length === 0) return;
    await this.metadataService.bulkSetMetadata(this.config.key, newMetadata);
    this.trackedItemIds.clear();
    for (const item of newMetadata) this.trackedItemIds.add(item.itemId);
    this.formatter.log(
      this.providerLabel,
      `Metadata refreshed: ${newMetadata.length} items tracked`,
    );
  }

  private async fetchMetadataFromApi(): Promise<ItemMetadata[]> {
    const apiBaseUrl = this.config.apiBaseUrl || this.config.auth['apiBaseUrl'];
    if (!apiBaseUrl) {
      this.formatter.warn(this.providerLabel, 'apiBaseUrl not configured');
      return [];
    }
    try {
      const url = `${apiBaseUrl}`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${this.authToken}`,
            Accept: 'application/json',
          },
        }),
      );
      const featuresData = response.data?.data?.features_data as TalaabFeaturesData | undefined;
      if (!featuresData) {
        this.formatter.error(
          this.providerLabel,
          `Homepage carried no features_data (keys: ${Object.keys(
            response.data?.data ?? response.data ?? {},
          )
            .slice(0, 8)
            .join(', ')})`,
        );
        return [];
      }
      this.describeHomepageRow(featuresData);
      const items: ItemMetadata[] = [];
      if (featuresData.molten) {
        for (const m of featuresData.molten) {
          items.push({
            itemId: m.id,
            name: m.title,
            unit: 'گرم',
            groupId: 1,
            groupName: 'آبشده',
          });
        }
      }
      if (featuresData.coin) {
        for (const c of featuresData.coin) {
          items.push({
            itemId: c.id,
            name: c.title,
            unit: 'عدد',
            groupId: 2,
            groupName: 'مسکوکات',
          });
        }
      }
      if (featuresData.silver) {
        for (const s of featuresData.silver) {
          items.push({
            itemId: s.id,
            name: s.title,
            unit: 'گرم',
            groupId: 3,
            groupName: 'نقره',
          });
        }
      }
      return items;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.noteIfAuthFailure(error, 'metadata');
      this.formatter.error(this.providerLabel, `Failed to fetch metadata: ${message}`);
      return [];
    }
  }

  /**
   * Record what a homepage row actually contains, once.
   *
   * The engine reads two fields off these rows and ignores the rest, so
   * whether the homepage also carries prices — which would let a shop be
   * seeded at connect instead of waiting for a push that may not come for
   * hours — is not something the log can currently answer. One debug line
   * answers it without guessing at fields that may not exist.
   */
  private describeHomepageRow(featuresData: TalaabFeaturesData): void {
    if (this.loggedHomepageShape) return;
    const first = featuresData.molten?.[0] ?? featuresData.coin?.[0] ?? featuresData.silver?.[0];
    if (!first) return;
    this.loggedHomepageShape = true;
    this.formatter.debug(
      this.providerLabel,
      `Homepage item fields: ${Object.keys(first).slice(0, 12).join(', ')}`,
    );
  }

  private async fetchAndStoreMetadata(): Promise<void> {
    const items = await this.fetchMetadataFromApi();
    if (items.length > 0) {
      await this.metadataService.bulkSetMetadata(this.config.key, items);
      this.trackedItemIds.clear();
      for (const item of items) this.trackedItemIds.add(item.itemId);
      this.formatter.log(this.providerLabel, `Initial metadata: ${items.length} items tracked`);
    } else {
      this.formatter.warn(this.providerLabel, 'No items found in homepage response');
    }
  }

  private async establishWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const agent = buildWebSocketAgent(this.wsUrl);
      this.ws = new WebSocket(this.wsUrl, agent ? { agent } : undefined);
      const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 30000);
      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.formatter.log(this.providerLabel, 'WebSocket opened, waiting for server hello');
        resolve();
      });
      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      const onFirstMessage = (data: Buffer) => {
        try {
          const frame = readPusherFrame(data.toString());
          if (frame.kind === 'connection_established') {
            this.socketId = frame.socketId;
            this.formatter.log(this.providerLabel, `Socket ID obtained: ${this.socketId}`);
            const channel = this.channelName();
            this.ws?.send(
              JSON.stringify({
                event: 'pusher:subscribe',
                data: { channel, auth: this.authToken },
              }),
            );
            // Requested, not established: the server's answer decides, and it
            // arrives on the listeners installed next.
            this.formatter.log(this.providerLabel, `Subscribe requested for channel ${channel}`);
            this.ws?.removeListener('message', onFirstMessage);
            this.setupSocketListeners();
            this.watchForSilence();
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.formatter.error(this.providerLabel, `Error parsing handshake: ${message}`);
        }
      };
      this.ws.on('message', onFirstMessage);
    });
  }

  private setupKeepAlive(): void {
    this.keepAliveInterval = setInterval(() => {
      if (this.isConnected() && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
      }
    }, 30000);
  }

  private channelName(): string {
    return this.config.auth['channel'] || this.config.key;
  }

  /**
   * Notice a subscription that never produces anything.
   *
   * A Pusher channel that is subscribed and idle and one that is subscribed
   * and broken look identical from the socket, and the difference only shows
   * as an empty price list somewhere else hours later. One warning, once, the
   * first time a shop stays silent past the point where silence is normal.
   */
  private watchForSilence(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      if (this.pricingFrames > 0) return;
      this.formatter.warn(
        this.providerLabel,
        `No pricing frame on channel ${this.channelName()} after ${this.silenceWarningMs / 1000}s ` +
          `(subscription ${this.subscribed ? 'confirmed' : 'never confirmed'}) – prices will stay empty until one arrives`,
      );
    }, this.silenceWarningMs);
    this.silenceTimer.unref?.();
  }

  private handleWebSocketMessage(raw: string): void {
    const frame = readPusherFrame(raw);
    switch (frame.kind) {
      case 'subscription_succeeded':
        this.subscribed = true;
        this.formatter.log(this.providerLabel, `Subscription confirmed for ${frame.channel}`);
        return;
      case 'subscription_error':
        if (frame.authRejected) {
          this.reportAuthExpired({ response: { status: frame.status } }, 'pusher subscribe');
          return;
        }
        this.formatter.error(
          this.providerLabel,
          `Subscription to ${frame.channel || this.channelName()} refused (status ${frame.status ?? 'unknown'})`,
        );
        return;
      case 'error':
        if (frame.authRejected) {
          this.reportAuthExpired({ response: { status: 401 } }, `pusher error ${frame.code}`);
          return;
        }
        this.formatter.error(
          this.providerLabel,
          `Pusher error ${frame.code ?? 'unknown'}: ${frame.message}`,
        );
        return;
      case 'pricing':
        this.pricingFrames++;
        this.processPricingUpdate({ pricing: frame.pricing });
        return;
      case 'home_data':
        if (!this.loggedHomeDataShape) {
          this.loggedHomeDataShape = true;
          this.formatter.debug(
            this.providerLabel,
            `Home snapshot carries: ${frame.fields.join(', ') || 'nothing'}`,
          );
        }
        return;
      case 'unreadable':
        this.formatter.error(this.providerLabel, `Unreadable frame: ${frame.reason}`);
        return;
      case 'other':
        this.formatter.debug(this.providerLabel, `Unhandled event: ${frame.event}`);
        return;
      default:
        return;
    }
  }

  private processPricingUpdate(data: any): void {
    const pricing = data.pricing;
    if (!pricing) return;

    let emitted = 0;
    let seen = 0;
    for (const vendor of pricing) {
      for (const currency of vendor.currencies ?? []) {
        seen++;
        if (!this.shouldTrackItem(currency.id)) continue;

        const shouldScale = !this.silverItemIds.has(currency.id);
        const buyPriceRaw = currency.buy_price;
        const sellPriceRaw = currency.sell_price;

        const buyPriceNum = parseFloat(buyPriceRaw);
        const sellPriceNum = parseFloat(sellPriceRaw);
        const buyPrice = shouldScale ? buyPriceNum * 1000 : buyPriceNum;
        const sellPrice = shouldScale ? sellPriceNum * 1000 : sellPriceNum;

        const priceData = this.createPriceData(
          currency.id,
          buyPrice,
          sellPrice,
          currency.buy_status,
          currency.sell_status,
        );
        void this.emitPriceUpdate(priceData);
        emitted++;
      }
    }
    if (emitted === 0 && seen > 0) {
      // The push arrived and none of it was ours: the ids in the stream and
      // the ids in the stored item list do not agree, which is a silent
      // outage everywhere else.
      this.formatter.warn(
        this.providerLabel,
        `Pricing push carried ${seen} items, none of them tracked (${this.trackedItemIds.size} tracked)`,
      );
      return;
    }
    this.formatter.debug(
      this.providerLabel,
      `Processed ${emitted}/${seen} items from ${pricing.length} vendors`,
    );
  }

  private createPriceData(
    itemId: number,
    buyPriceRaw: any,
    sellPriceRaw: any,
    buyStatus: number,
    sellStatus: number,
  ): PriceData {
    const buyPrice = typeof buyPriceRaw === 'string' ? parseFloat(buyPriceRaw) : buyPriceRaw;
    const sellPrice = typeof sellPriceRaw === 'string' ? parseFloat(sellPriceRaw) : sellPriceRaw;
    const spread = buyPrice - sellPrice;
    const spreadPercent = sellPrice > 0 ? (spread / sellPrice) * 100 : 0;

    return {
      itemId,
      buyPrice,
      sellPrice,
      buyPriceStr: buyPrice.toLocaleString('fa-IR') + ' تومان',
      sellPriceStr: sellPrice.toLocaleString('fa-IR') + ' تومان',
      canBuy: buyStatus === 1,
      canSell: sellStatus === 1,
      buyRange: 0,
      sellRange: 0,
      maxBuyCount: 0,
      maxSellCount: 0,
      spread,
      spreadPercent,
      updatedTimeStr: new Date().toLocaleTimeString(),
      timestamp: new Date().toISOString(),
    };
  }

  private async waitForShopOpen(): Promise<void> {
    try {
      const profile = await this.getShopProfile();

      const sellStatus = profile?.data?.sell_status ?? 0;
      const buyStatus = profile?.data?.buy_status ?? 0;
      const isOpen = sellStatus !== 0 || buyStatus !== 0;

      if (!isOpen) {
        this.formatter.warn(this.providerLabel, 'Shop is closed – waiting for it to open');
        await this.publishShopStatus(false);

        let retries = 0;
        const maxRetries = 180;
        const baseDelay = 10000;

        while (retries < maxRetries && !this.stopped) {
          const delay = baseDelay * Math.min(3, 1.5 ** retries);
          await new Promise((resolve) => setTimeout(resolve, delay));

          retries++;
          try {
            const updated = await this.getShopProfile();
            const updatedSellStatus = updated?.data?.sell_status ?? 0;
            const updatedBuyStatus = updated?.data?.buy_status ?? 0;
            if (updatedSellStatus !== 0 || updatedBuyStatus !== 0) {
              this.formatter.log(this.providerLabel, 'Shop is now open');
              await this.publishShopStatus(true);
              return;
            }
          } catch {
            this.formatter.error(this.providerLabel, 'Failed to check shop status');
          }

          if (retries % 10 === 0) {
            this.formatter.log(
              this.providerLabel,
              `Still waiting for shop to open (${(retries * baseDelay) / 1000}s elapsed)`,
            );
          }
        }

        if (!this.stopped) {
          this.formatter.error(this.providerLabel, 'Shop did not open – disconnecting');
          this.disconnect();
        }
      } else {
        this.formatter.log(this.providerLabel, 'Shop is open');
        await this.publishShopStatus(true);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.noteIfAuthFailure(error, 'shop status');
      this.formatter.error(this.providerLabel, `Failed to check shop status: ${message}`);
    }
  }

  private async publishShopStatus(isOnline: boolean): Promise<void> {
    const payload = {
      name: this.config.key,
      category: this.config.category,
      onlineStatus: isOnline,
      shopkeeperId: this.config.key,
      timestamp: new Date().toISOString(),
    };

    if (this.rabbitMQService) {
      await this.rabbitMQService.publish(
        MessagePatterns.PROVIDER_STATUS_CHANGED,
        payload,
        this.config.key,
      );
    }

    this.formatter.log(
      this.providerLabel,
      `Shop status published: ${isOnline ? 'online' : 'offline'}`,
    );
  }
}
