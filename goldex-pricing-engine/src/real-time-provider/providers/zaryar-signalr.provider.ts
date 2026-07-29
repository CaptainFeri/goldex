import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import WebSocket from 'ws';
import { firstValueFrom } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { ConsoleFormatterService } from '../../common/console-formatter.service';
import { BaseRealtimeProvider } from '../base-realtime.provider';
import { RedisService, PriceData } from '../../redis/redis.service';
import { DealView } from '../types/deal-view.type';
import { ItemMetadata, ItemMetadataService } from '../item-metadata.service';
import { RabbitMQService, MessagePatterns } from '../../rabbitmq/rabbitmq.module';
import { NegotiateResponse, SignalRMessage, MazaneItem } from '../types/zaryar.types';

@Injectable()
export class ZaryarSignalRProvider extends BaseRealtimeProvider {
  private ws: WebSocket | null = null;
  private connectionToken = '';
  private connectionId = '';
  private messageId = '';
  private groupsToken = '';
  private hubName = 'signalRPushHub';
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private metadataRefreshInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly httpService: HttpService,
    metadataService: ItemMetadataService,
    redisService: RedisService,
    formatter: ConsoleFormatterService,
    rabbitMQService?: RabbitMQService,
  ) {
    super(redisService, metadataService, rabbitMQService);
    this.setFormatter(formatter);
  }

  async getPrice(itemId: number): Promise<PriceData | null> {
    const cached = await this.redisService.getCurrentPrice(this.config.key, itemId);
    if (cached) return cached;

    try {
      const url = `${this.config.baseUrl.replace('/signalr', '')}/api/Home/ShopkeeperItemsList`;
      const response = await firstValueFrom(
        this.httpService.post(url, { filter: 'all' }, { headers: this.buildHeaders() }),
      );
      const groups = response.data.Data || [];
      for (const group of groups) {
        const rawItems = group.Items || [];
        const item = rawItems.find((i: any) => i.Id === itemId);
        if (item) {
          const priceData = this.mapToPriceData({
            ItemId: item.Id,
            FeeBuy: item.FeeBuy,
            FeeSell: item.FeeSell,
            FeeBuyStr: item.FeeBuyStr,
            FeeSellStr: item.FeeSellStr,
            BuyCanDeal: item.BuyCanDeal,
            SellCanDeal: item.SellCanDeal,
            BuyRange: item.BuyRange,
            SellRange: item.SellRange,
            MaxBuyCount: item.MaxBuyCount,
            MaxSellCount: item.MaxSellCount,
            UpdatedTimeStr: item.UpdatedTimeStr,
            IBuy: item.IBuy,
            ISell: item.ISell,
            IsShow: item.IsShow,
          });
          await this.redisService.setCurrentPrice(this.config.key, itemId, priceData);
          return priceData;
        }
      }
      return null;
    } catch {
      this.formatter.error(this.providerLabel, `Failed to get price for item ${itemId}`);
      return null;
    }
  }

  async getDealView(itemId: number, dealType = 0): Promise<DealView> {
    const url = `${this.config.baseUrl.replace('/signalr', '')}/api/Home/GetDealView`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            itemId,
            shopkeeperId: this.config.auth['shopkeeperId'],
            dealType,
          },
          { headers: this.buildHeaders() },
        ),
      );
      const data = response.data.Data;
      return {
        itemId: data.Id,
        itemName: data.Name,
        price: data.Price,
        discountPrice: data.DiscountPrice,
        minCount: data.MinCount,
        maxCount: data.MaxCount,
        waitTime: data.WaitTime,
        canDoDeal: data.CanDoDeal,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error(
        this.providerLabel,
        `Failed to get deal view for item ${itemId}: ${message}`,
      );
      throw error;
    }
  }

  private async fetchMetadataFromApi(): Promise<ItemMetadata[]> {
    try {
      const url = `${this.config.baseUrl.replace('/signalr', '')}/api/Home/ShopkeeperItemsList`;
      const response = await firstValueFrom(
        this.httpService.post(url, { filter: 'all' }, { headers: this.buildHeaders() }),
      );
      const groups = response.data?.Data || [];
      const items: ItemMetadata[] = [];
      for (const group of groups) {
        const groupName = group.GroupName || '';
        let groupId = 0;
        let unit = '';

        const lowerGroup = groupName.toLowerCase();
        if (lowerGroup.includes('مسکوکات') || lowerGroup.includes('سکه')) {
          groupId = 2;
          unit = 'عدد';
        } else if (
          lowerGroup.includes('آبشده') ||
          lowerGroup.includes('نقد') ||
          lowerGroup.includes('طلای')
        ) {
          groupId = 1;
          unit = 'گرم';
        } else if (lowerGroup.includes('نقره')) {
          groupId = 3;
          unit = 'گرم';
        } else {
          groupId = group.GroupId || 1;
          unit = groupId === 2 ? 'عدد' : 'گرم';
        }

        const rawItems = group.Items || [];
        for (const raw of rawItems) {
          items.push({
            itemId: raw.Id,
            name: raw.Name,
            unit,
            groupId,
            groupName,
          });
        }
      }
      return items;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error(this.providerLabel, `Failed to fetch metadata from API: ${message}`);
      return [];
    }
  }

  private async fetchAndStoreMetadata(): Promise<void> {
    const items = await this.fetchMetadataFromApi();
    if (items.length > 0) {
      await this.metadataService.bulkSetMetadata(this.config.key, items);
      this.trackedItemIds.clear();
      for (const item of items) {
        this.trackedItemIds.add(item.itemId);
      }
      this.formatter.log(this.providerLabel, `Initial metadata: ${items.length} items tracked`);
    } else {
      this.formatter.warn(this.providerLabel, 'No metadata found');
    }
  }

  async connect(): Promise<void> {
    if (this.stopped) return;
    this.formatter.log(
      this.providerLabel,
      `Connecting Zaryar (SignalR) provider: ${this.config.key}`,
    );
    await this.negotiate();
    await this.establishWebSocket();
    await this.startConnection();
    await this.fetchAndStoreMetadata();
    this.startMetadataRefresh();
    this.setupKeepAlive();
    this.setupSocketListeners();
    this.connected = true;
    this.formatter.printConnectionEvent(this.providerLabel, 'connected');

    await this.waitForShopOpen();
  }

  private startMetadataRefresh(): void {
    const interval = this.config.metadataRefreshIntervalMs || 5 * 60 * 1000;
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
    if (newMetadata.length === 0) {
      this.formatter.warn(this.providerLabel, 'No metadata returned from API – skipping refresh');
      return;
    }

    await this.metadataService.bulkSetMetadata(this.config.key, newMetadata);

    this.trackedItemIds.clear();
    for (const item of newMetadata) {
      this.trackedItemIds.add(item.itemId);
    }

    this.formatter.log(
      this.providerLabel,
      `Metadata refreshed: ${newMetadata.length} items now tracked`,
    );
  }

  private async fetchInitialPrices(): Promise<void> {
    if (this.trackedItemIds.size === 0) {
      this.formatter.warn(this.providerLabel, 'No tracked items to fetch initial prices for');
      return;
    }

    try {
      const url = `${this.config.baseUrl.replace('/signalr', '')}/api/Home/ShopkeeperItemsList`;

      const response = await firstValueFrom(
        this.httpService.post(url, { filter: 'all' }, { headers: this.buildHeaders() }),
      );

      const groups = response.data?.Data || [];
      for (const group of groups) {
        for (const raw of group.Items) {
          const itemId = raw.Id;
          if (this.shouldTrackItem(itemId)) {
            const priceData = this.mapToPriceData({
              ItemId: raw.Id,
              FeeBuy: raw.FeeBuy,
              FeeSell: raw.FeeSell,
              FeeBuyStr: raw.FeeBuyStr,
              FeeSellStr: raw.FeeSellStr,
              BuyCanDeal: raw.BuyCanDeal,
              SellCanDeal: raw.SellCanDeal,
              BuyRange: raw.BuyRange,
              SellRange: raw.SellRange,
              MaxBuyCount: raw.MaxBuyCount,
              MaxSellCount: raw.MaxSellCount,
              UpdatedTimeStr: raw.UpdatedTimeStr,
              IBuy: raw.IBuy,
              ISell: raw.ISell,
              IsShow: raw.IsShow,
            });
            await this.emitPriceUpdate(priceData);
          }
        }
      }
      this.formatter.log(
        this.providerLabel,
        `Initial prices fetched for ${this.trackedItemIds.size} items`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error(this.providerLabel, `Failed to fetch initial prices: ${message}`);
    }
  }

  disconnect(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.metadataRefreshInterval) {
      clearInterval(this.metadataRefreshInterval);
      this.metadataRefreshInterval = null;
    }
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
    const url = `${this.config.baseUrl.replace('/signalr', '')}/api/Profile/GetProfile`;

    const response = await firstValueFrom(
      this.httpService.get(url, {
        headers: this.buildHeaders(),
      }),
    );
    return response;
  }

  private async waitForShopOpen(): Promise<void> {
    try {
      const profile = await this.getShopProfile();

      const shopkeeper = profile.data?.Data?.Shopkeeper;
      const isOnline = shopkeeper?.IsOnline ?? false;
      const shopkeeperId = shopkeeper?.Id || this.config.auth['shopkeeperId'];

      if (!isOnline) {
        this.formatter.warn(this.providerLabel, 'Shop is closed – waiting for it to open');
        await this.publishShopStatus(shopkeeper?.Name, shopkeeperId, false);

        let retries = 0;
        const maxRetries = 180;
        const baseDelay = 10000;

        while (retries < maxRetries && !this.stopped) {
          const delay = baseDelay * Math.min(3, 1.5 ** retries);
          await new Promise((resolve) => setTimeout(resolve, delay));

          retries++;
          try {
            const updated = await this.getShopProfile();
            const updatedShopkeeper = updated?.Data?.shopkeeper;
            if (updatedShopkeeper?.IsOnline) {
              this.formatter.log(this.providerLabel, 'Shop is now open');
              await this.publishShopStatus(updatedShopkeeper.Name, shopkeeperId, true);
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
        await this.publishShopStatus(shopkeeper?.Name, shopkeeperId, true);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error(this.providerLabel, `Failed to check shop status: ${message}`);
    }
  }

  private async publishShopStatus(
    name: string | undefined,
    shopkeeperId: string,
    isOnline: boolean,
  ): Promise<void> {
    const payload = {
      name: name || this.config.key,
      category: this.config.category,
      onlineStatus: isOnline,
      shopkeeperId,
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

  protected setupSocketListeners(): void {
    if (!this.ws) return;
    this.ws.on('close', () => this.handleDisconnect());
    this.ws.on('error', (err) => this.formatter.error(this.providerLabel, err.message));
  }

  protected async authenticate(): Promise<string> {
    return this.config.auth['token'] || '';
  }

  private async negotiate(): Promise<void> {
    try {
      const negotiateUrl = `${this.config.baseUrl}/negotiate?clientProtocol=2.1`;
      const response = await firstValueFrom(
        this.httpService.get<NegotiateResponse>(negotiateUrl, {
          headers: {
            Origin: this.originUrl,
            'User-Agent': 'Mozilla/5.0',
            Cookie: this.cookieString(),
            Accept: 'application/json',
          },
          params: {
            uId: this.config.auth['uId'] || '',
            at: '1',
            sId: this.config.auth['shopkeeperId'] || '',
          },
        }),
      );
      this.connectionToken = response.data.ConnectionToken;
      this.connectionId = response.data.ConnectionId || '';
      if (!this.connectionToken) throw new Error('No connection token');
      this.formatter.log(this.providerLabel, `Negotiation OK, ConnectionId: ${this.connectionId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error(this.providerLabel, `Negotiation failed: ${message}`);
      throw error;
    }
  }

  private async establishWebSocket(): Promise<void> {
    const wsProtocol = this.config.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const host = this.config.baseUrl.replace(/^https?:\/\//, '').replace('/signalr', '');
    const uId = this.config.auth['uId'] || '';
    const sId = this.config.auth['shopkeeperId'] || '';
    const connectionData = JSON.stringify([{ name: this.hubName }]);
    const wsUrl = `${wsProtocol}://${host}/signalr/connect?transport=webSockets&clientProtocol=2.1&uId=${uId}&at=1&sId=${sId}&connectionToken=${encodeURIComponent(this.connectionToken)}&connectionData=${encodeURIComponent(connectionData)}&tid=${Math.floor(Math.random() * 11)}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl, {
        headers: {
          Origin: this.originUrl,
          Cookie: `shopkeeperId=${sId}; uId=${uId}`,
        },
      });
      const timeout = setTimeout(() => reject(new Error('WS timeout')), 30000);
      this.ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });
      this.ws.on('message', (data: Buffer) => this.handleSignalRMessage(data.toString()));
      this.ws.on('error', reject);
    });
  }

  private async startConnection(): Promise<void> {
    try {
      const startUrl = `${this.config.baseUrl}/start?transport=webSockets&clientProtocol=2.1&connectionToken=${encodeURIComponent(this.connectionToken)}&connectionData=${encodeURIComponent(JSON.stringify([{ name: this.hubName }]))}&tid=${Math.floor(Math.random() * 11)}`;
      const response = await firstValueFrom(
        this.httpService.get(startUrl, {
          headers: {
            Origin: this.originUrl,
            Cookie: this.cookieString(),
          },
          params: {
            uId: this.config.auth['uId'] || '',
            at: '1',
            sId: this.config.auth['shopkeeperId'] || '',
          },
        }),
      );
      if (response.data?.Response !== 'started') throw new Error('Start failed');
      this.formatter.log(this.providerLabel, 'Connection started');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error(this.providerLabel, `Start connection failed: ${message}`);
      throw error;
    }
  }

  private handleSignalRMessage(raw: string): void {
    if (!raw || raw === '{}') return;
    try {
      const msg = JSON.parse(raw) as SignalRMessage;
      if (msg.C) this.messageId = msg.C;
      if (msg.M) {
        for (const hubMsg of msg.M) {
          if (hubMsg.H === this.hubName && hubMsg.M === 'SendMessage') {
            for (const arg of hubMsg.A) {
              if (arg?.data?.alert_type === 'update_mazane') {
                const items = arg.data.payload?.Items as MazaneItem[];
                if (items?.length) {
                  const trackedItems = items.filter((item) => this.shouldTrackItem(item.ItemId));
                  if (trackedItems.length > 0) {
                    for (const item of trackedItems) {
                      const priceData = this.mapToPriceData(item);
                      void this.emitPriceUpdate(priceData);
                    }
                    this.formatter.log(
                      this.providerLabel,
                      `Processed ${trackedItems.length}/${items.length} tracked items`,
                    );
                  } else {
                    this.formatter.debug(
                      this.providerLabel,
                      `No tracked items in update (${items.length} total)`,
                    );
                  }
                }
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error(this.providerLabel, `Parse error: ${message}`);
    }
  }

  private mapToPriceData(item: MazaneItem): PriceData {
    const spread = (item.FeeBuy || 0) - (item.FeeSell || 0);
    const spreadPercent = item.FeeSell ? (spread / item.FeeSell) * 100 : 0;
    return {
      itemId: item.ItemId,
      buyPrice: item.FeeBuy || 0,
      sellPrice: item.FeeSell || 0,
      buyPriceStr: item.FeeBuyStr || '0',
      sellPriceStr: item.FeeSellStr || '0',
      canBuy: item.BuyCanDeal || false,
      canSell: item.SellCanDeal || false,
      buyRange: item.BuyRange || 0,
      sellRange: item.SellRange || 0,
      maxBuyCount: item.MaxBuyCount || 0,
      maxSellCount: item.MaxSellCount || 0,
      spread,
      spreadPercent,
      updatedTimeStr: item.UpdatedTimeStr,
      timestamp: new Date().toISOString(),
      iBuy: item.IBuy,
      iSell: item.ISell,
      isShow: item.IsShow,
    };
  }

  private get originUrl(): string {
    return this.config.originUrl || this.config.baseUrl.replace('/signalr', '');
  }

  private cookieString(): string {
    const { auth } = this.config;
    return Object.entries(auth)
      .filter(([k]) => ['sessionId', 'shopkeeperId', 'user', 'roleType'].includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private buildHeaders(): Record<string, string> {
    const { auth } = this.config;
    return {
      Authorization: `Bearer ${auth['token'] || ''}`,
      'x-request-id': uuid().replace(/-/g, ''),
      roleType: auth['roleType'] || '0',
      sessionId: auth['sessionId'] || '',
      shopkeeperId: auth['shopkeeperId'] || '',
      'Content-Type': 'application/json',
      Cookie: this.cookieString(),
    };
  }

  private setupKeepAlive(): void {
    this.keepAliveInterval = setInterval(() => {
      if (this.isConnected() && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }
}
