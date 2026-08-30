import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import { ProviderEntity } from './entity/provider.entity';
import { ProviderDealEntity } from './entity/provider-deal.entity';
import { ProviderAccountService } from './provider-account.service';
import { ProviderCategory } from './types/enums';
import { RabbitMQService, MessagePatterns, RabbitMQMessage } from '../rabbitmq/rabbitmq.module';
import {
  ZaryarDealViewData,
  ZaryarSubmitDealRequest,
  ZaryarSubmitDealResponse,
  ZaryarDealListResponse,
  ZaryarDealsListRequest,
  ZaryarDealItem,
} from './types/zaryar-deal.types';
import {
  TalaabTradeRequest,
  TalaabTradeResponse,
  TalaabLatestTradesResponse,
  TalaabLatestTrade,
} from './types/talaab-finance.types';

interface OrderPlaceRequestData {
  providerKey: string;
  itemId: number;
  dealType: number;
  count: number;
  clientOrderId?: string;
  price?: number; // pure/real price we place with the provider (mesghal)
  customerPrice?: number; // customer-shown price per mesghal (with markup)
  customerGramPrice?: number; // customer-shown price per gram (with markup)
  gramVolume?: number; // customer-facing volume in grams
  gramPrice?: number; // pure per-gram price
}

interface TrackedOrder {
  providerKey: string;
  orderId: string;
  itemId: number;
  dealType: number;
  count: number;
  lastStatus: number;
  interval: NodeJS.Timeout;
  clientOrderId?: string;
}

@Injectable()
export class ProviderOrderService implements OnModuleInit {
  private trackedOrders = new Map<string, TrackedOrder>();

  constructor(
    @InjectRepository(ProviderEntity)
    private providerRepo: Repository<ProviderEntity>,
    @InjectRepository(ProviderDealEntity)
    private dealRepo: Repository<ProviderDealEntity>,
    private readonly httpService: HttpService,
    private readonly formatter: ConsoleFormatterService,
    private readonly providerAccountService: ProviderAccountService,
    private readonly rabbitMQService?: RabbitMQService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.rabbitMQService) {
      await this.rabbitMQService.subscribe(
        MessagePatterns.ORDER_PLACE_REQUEST,
        this.handleOrderPlaceRequest.bind(this),
      );
      this.formatter.log('ProviderOrder', 'Subscribed to order place requests');
    }
  }

  private async handleOrderPlaceRequest(msg: RabbitMQMessage): Promise<void> {
    const data = msg.data as OrderPlaceRequestData;
    this.formatter.log(
      'ProviderOrder',
      `Order request received: item=${data.itemId}, type=${data.dealType}, count=${data.count}, provider=${data.providerKey}`,
    );

    try {
      await this.placeOrder(data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderOrder', `Failed to place order: ${message}`);
      // Tell the backend the order failed so it rejects it and refunds the user
      // (otherwise the order would sit PENDING with the balance frozen forever).
      await this.publishOrderFailed(data, message);
    }
  }

  // Publishes a terminal "failed" status (status=2 → backend rejects + unlocks).
  private async publishOrderFailed(data: OrderPlaceRequestData, reason: string): Promise<void> {
    if (!this.rabbitMQService || !data.clientOrderId) return;
    try {
      await this.rabbitMQService.publish(
        MessagePatterns.ORDER_STATUS_CHANGED,
        {
          providerKey: data.providerKey,
          orderId: '',
          itemId: data.itemId,
          dealType: data.dealType,
          count: data.count,
          clientOrderId: data.clientOrderId,
          status: 2, // failed/rejected
          statusStr: reason,
        },
        data.providerKey,
      );
    } catch (err) {
      this.formatter.error('ProviderOrder', `Failed to publish order-failed: ${(err as Error).message}`);
    }
  }

  async placeOrder(data: OrderPlaceRequestData): Promise<{ orderId: string }> {
    const provider = await this.providerRepo.findOne({ where: { key: data.providerKey } });
    if (!provider) {
      throw new Error(`Provider ${data.providerKey} not found`);
    }

    switch (provider.category) {
      case ProviderCategory.ZARYAR:
        return this.placeZaryarOrder(provider, data);
      case ProviderCategory.TALAAB:
        return this.placeTalaabOrder(provider, data);
      default:
        throw new Error(`Order placement not supported for category: ${provider.category}`);
    }
  }

  private async placeZaryarOrder(
    provider: ProviderEntity,
    data: OrderPlaceRequestData,
  ): Promise<{ orderId: string }> {
    const apiBaseUrl = provider.apiBaseUrl || provider.baseUrl.replace('/signalr', '');
    const headers = this.buildZaryarHeaders(provider);

    const dealView = await this.fetchDealView(apiBaseUrl, headers, data.itemId, data.dealType);

    const clientOrderId = data.clientOrderId || uuid();
    const body = this.buildSubmitDealBody(dealView, data, clientOrderId);

    const response = await firstValueFrom(
      this.httpService.post<ZaryarSubmitDealResponse>(
        `${apiBaseUrl}/api/Home/SubmitDeal`,
        body,
        { headers },
      ),
    );

    const result = response.data;
    if (!result.IsSuccess) {
      throw new Error(`SubmitDeal failed: ${result.Message}`);
    }

    const orderId = result.Data.Id;
    this.formatter.log(
      'ProviderOrder',
      `Zaryar order submitted: id=${orderId}, item=${data.itemId}, count=${data.count}`,
    );

    // Persist the deal in provider_deals (status pending); tracking updates it.
    await this.saveDeal({
      providerKey: provider.key,
      providerCategory: ProviderCategory.ZARYAR,
      orderId,
      itemId: data.itemId,
      count: data.count,
      dealType: data.dealType,
      inputPrice: data.price,
      customerPrice: data.customerPrice,
      customerGramPrice: data.customerGramPrice,
      gramVolume: data.gramVolume,
      gramPrice: data.gramPrice,
      orderStatusStr: result.Data.OrderStatusStr,
    });

    await this.publishOrderPlaced(data, orderId, result.Data.OrderStatus, result.Data.OrderStatusStr, clientOrderId);
    this.startZaryarTracking(apiBaseUrl, headers, orderId, data, clientOrderId);

    return { orderId };
  }

  private async placeTalaabOrder(
    provider: ProviderEntity,
    data: OrderPlaceRequestData,
  ): Promise<{ orderId: string }> {
    const apiBaseUrl =
      provider.apiBaseUrl?.replace('/homepage', '') || 'https://api.afroghnegaremana.ir/api/v1';
    const headers = this.buildTalaabHeaders(provider);

    if (!data.price) {
      throw new Error('Talaab order requires a price field');
    }

    const tradeType = data.dealType === 0 ? '1' : '0';
    const body: TalaabTradeRequest = {
      current_price: String(data.price),
      trade_type: tradeType,
      description: '',
      weight: String(data.count),
      calculate_type: data.itemId,
      trade_id: 1,
      price_unit: 'toman',
    };

    const response = await firstValueFrom(
      this.httpService.post<TalaabTradeResponse>(
        `${apiBaseUrl}/profile/trades/molten`,
        body,
        { headers },
      ),
    );

    const result = response.data;
    if (!result.success) {
      throw new Error(`Talaab trade failed: ${result.message}`);
    }

    const orderId = String(result.data.request_id);
    this.formatter.log(
      'ProviderOrder',
      `Talaab order submitted: request_id=${orderId}, item=${data.itemId}, count=${data.count}`,
    );

    await this.publishOrderPlaced(data, orderId, result.data.status, '', data.clientOrderId);
    this.startTalaabTracking(apiBaseUrl, headers, orderId, data);

    await this.saveTalaabDeal(provider.key, result.data, data);

    return { orderId };
  }

  private async saveTalaabDeal(
    providerKey: string,
    tradeData: TalaabTradeResponse['data'],
    data: OrderPlaceRequestData,
  ): Promise<void> {
    try {
      const entity = {
        providerKey,
        providerCategory: ProviderCategory.TALAAB,
        orderId: String(tradeData.request_id),
        orderCode: String(tradeData.request_id),
        itemId: data.itemId,
        itemName: tradeData.gold_type_title,
        count: tradeData.value,
        totalPrice: tradeData.price,
        inputPrice: data.price,
        customerPrice: data.customerPrice,
        customerGramPrice: data.customerGramPrice,
        gramVolume: data.gramVolume,
        gramPrice: data.gramPrice,
        mesghalPrice: data.price, // price placed with the provider is per mesghal
        dealType: data.dealType,
        dealTypeStr: tradeData.type_text,
        dealStatus: tradeData.status,
        orderStatusStr: '',
        mazane: tradeData.mazaneh,
        mazaneStr: String(tradeData.mazaneh),
        orderDate: new Date(),
        rawData: tradeData as any,
      };

      await this.dealRepo.save(this.dealRepo.create(entity));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderOrder', `Failed to save Talaab deal: ${message}`);
    }
  }

  // Generic deal persistence (used by Zaryar; Talaab uses saveTalaabDeal).
  private async saveDeal(params: {
    providerKey: string;
    providerCategory: ProviderCategory;
    orderId: string;
    itemId: number;
    count: number;
    dealType: number;
    totalPrice?: number;
    inputPrice?: number;
    customerPrice?: number;
    customerGramPrice?: number;
    gramVolume?: number;
    gramPrice?: number;
    itemName?: string;
    orderStatusStr?: string;
  }): Promise<void> {
    try {
      await this.dealRepo.save(
        this.dealRepo.create({
          providerKey: params.providerKey,
          providerCategory: params.providerCategory,
          orderId: params.orderId,
          orderCode: params.orderId,
          itemId: params.itemId,
          itemName: params.itemName,
          count: params.count,
          totalPrice: params.totalPrice,
          inputPrice: params.inputPrice,
          customerPrice: params.customerPrice,
          customerGramPrice: params.customerGramPrice,
          gramVolume: params.gramVolume,
          gramPrice: params.gramPrice,
          mesghalPrice: params.inputPrice, // price placed with the provider is per mesghal
          dealType: params.dealType,
          dealStatus: 0, // pending
          orderStatusStr: params.orderStatusStr ?? 'pending',
          orderDate: new Date(),
        }),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderOrder', `Failed to save deal ${params.orderId}: ${message}`);
    }
  }

  // Updates the stored deal's status as the provider order progresses.
  private async updateDealStatus(
    providerKey: string,
    orderId: string,
    status: number,
    statusStr: string,
  ): Promise<void> {
    try {
      const update: Partial<ProviderDealEntity> = { dealStatus: status, orderStatusStr: statusStr };
      const deal = await this.dealRepo.findOne({ where: { providerKey, orderId } });
      // On success, the mock fills at the requested price → record it as filled.
      if (status === 1 && deal) update.filledPrice = deal.inputPrice;
      await this.dealRepo.update({ providerKey, orderId }, update);
      // A completed deal changes the provider's settled position — push the fresh
      // aggregate to the backend so the dashboard/provider-finance reflect it.
      if (status === 1) await this.providerAccountService.publishDealBalance(providerKey);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderOrder', `Failed to update deal ${orderId}: ${message}`);
    }
  }

  private async fetchDealView(
    apiBaseUrl: string,
    headers: Record<string, string>,
    itemId: number,
    dealType: number,
  ): Promise<ZaryarDealViewData> {
    const response = await firstValueFrom(
      this.httpService.post<{ IsSuccess: boolean; Data: ZaryarDealViewData }>(
        `${apiBaseUrl}/api/Home/GetDealView`,
        { itemId, dealType },
        { headers },
      ),
    );

    if (!response.data.IsSuccess) {
      throw new Error('GetDealView failed');
    }

    return response.data.Data;
  }

  private buildSubmitDealBody(
    dealView: ZaryarDealViewData,
    data: OrderPlaceRequestData,
    clientOrderId: string,
  ): ZaryarSubmitDealRequest {
    return {
      Id: dealView.Id,
      ClientOrderId: clientOrderId,
      ShopName: dealView.ShopName,
      ShopkeeperId: dealView.ShopkeeperId,
      Name: dealView.Name,
      Unit: dealView.Unit,
      GoldEquivalent: dealView.GoldEquivalent,
      Carat: dealView.Carat,
      Image: dealView.Image,
      DiscountPrice: dealView.DiscountPrice,
      AllowRange: dealView.AllowRange,
      OrderHallAllowRange: dealView.OrderHallAllowRange,
      ItemType: dealView.ItemType,
      ItemGroupId: dealView.ItemGroupId,
      ItemGroupName: dealView.ItemGroupName,
      IBuy: dealView.IBuy,
      ISell: dealView.ISell,
      IsShow: dealView.IsShow,
      CanDeal: dealView.CanDeal,
      IsOnline: dealView.IsOnline,
      ShowMazaneInCloseShop: dealView.ShowMazaneInCloseShop,
      GoldInventory: dealView.GoldInventory,
      Description: dealView.Description,
      ExtraDescription: dealView.ExtraDescription,
      Discount: dealView.Discount,
      Price: dealView.Price,
      MaxCount: dealView.MaxCount,
      MinCount: dealView.MinCount,
      RemainCount: dealView.RemainCount,
      CanDoOrderDeal: dealView.CanDoOrderDeal,
      CanDoDeal: dealView.CanDoDeal,
      WaitTime: dealView.WaitTime,
      CancelDealByCustomerWaitTime: dealView.CancelDealByCustomerWaitTime,
      RoundType: dealView.RoundType,
      UpdatedTime: dealView.UpdatedTime,
      OrderIndex: dealView.OrderIndex,
      Credit: dealView.Credit,
      CreditStr: dealView.CreditStr,
      OnlyShowForMazaneChannel: dealView.OnlyShowForMazaneChannel,
      OrderDealAllowRange: dealView.OrderDealAllowRange,
      OrderDealFromAllowRange: dealView.OrderDealFromAllowRange,
      OrderDealToAllowRange: dealView.OrderDealToAllowRange,
      OrderTimes: dealView.OrderTimes,
      MaxOrderDealExpireTime: dealView.MaxOrderDealExpireTime,
      ItemName: dealView.ItemName,
      ItemUnit: dealView.ItemUnit,
      ItemId: dealView.ItemId,
      Count: data.count,
      IsOrderDeal: false,
      IsRecovery: false,
      OrderId: '',
      DealType: data.dealType,
      Fee: dealView.DiscountPrice,
    };
  }

  private async publishOrderPlaced(
    data: OrderPlaceRequestData,
    orderId: string,
    status: number,
    statusStr: string,
    clientOrderId?: string,
  ): Promise<void> {
    if (this.rabbitMQService) {
      await this.rabbitMQService.publish(
        MessagePatterns.ORDER_PLACED,
        {
          providerKey: data.providerKey,
          orderId,
          itemId: data.itemId,
          dealType: data.dealType,
          count: data.count,
          clientOrderId,
          status,
          statusStr,
        },
        data.providerKey,
      );
    }
  }

  private startZaryarTracking(
    apiBaseUrl: string,
    headers: Record<string, string>,
    orderId: string,
    data: OrderPlaceRequestData,
    clientOrderId?: string,
  ): void {
    const interval = setInterval(async () => {
      try {
        const status = await this.checkOrderStatus(apiBaseUrl, headers, orderId);
        if (status === null) return;

        const tracked = this.trackedOrders.get(orderId);
        if (!tracked) return;

        if (status !== tracked.lastStatus) {
          tracked.lastStatus = status;
          const statusStr = status === 1 ? 'انجام شده' : status === 2 ? 'لغو شده' : 'در انتظار';
          this.formatter.log(
            'ProviderOrder',
            `Order ${orderId} status changed to ${status} (${statusStr})`,
          );

          await this.updateDealStatus(data.providerKey, orderId, status, statusStr);
          this.stopTracking(orderId);

          if (this.rabbitMQService) {
            await this.rabbitMQService.publish(
              MessagePatterns.ORDER_STATUS_CHANGED,
              {
                providerKey: data.providerKey,
                orderId,
                itemId: data.itemId,
                dealType: data.dealType,
                count: data.count,
                clientOrderId,
                status,
                statusStr,
              },
              data.providerKey,
            );
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.formatter.error('ProviderOrder', `Track error for ${orderId}: ${message}`);
      }
    }, 5000);

    this.trackedOrders.set(orderId, {
      providerKey: data.providerKey,
      orderId,
      itemId: data.itemId,
      dealType: data.dealType,
      count: data.count,
      lastStatus: 0,
      interval,
      clientOrderId,
    });

    this.formatter.log('ProviderOrder', `Started tracking order ${orderId}`);
  }

  private stopTracking(orderId: string): void {
    const tracked = this.trackedOrders.get(orderId);
    if (tracked) {
      clearInterval(tracked.interval);
      this.trackedOrders.delete(orderId);
      this.formatter.log('ProviderOrder', `Stopped tracking order ${orderId}`);
    }
  }

  private startTalaabTracking(
    apiBaseUrl: string,
    headers: Record<string, string>,
    requestId: string,
    data: OrderPlaceRequestData,
  ): void {
    const interval = setInterval(async () => {
      try {
        const status = await this.checkTalaabOrderStatus(apiBaseUrl, headers, requestId);
        if (status === null) return;

        const tracked = this.trackedOrders.get(requestId);
        if (!tracked) return;

        if (status !== tracked.lastStatus) {
          tracked.lastStatus = status;
          const statusStr = status === 1 ? 'تایید شده' : status === 2 ? 'رد شده' : 'در انتظار';
          this.formatter.log(
            'ProviderOrder',
            `Talaab order ${requestId} status changed to ${status} (${statusStr})`,
          );

          await this.updateDealStatus(data.providerKey, requestId, status, statusStr);
          this.stopTracking(requestId);

          if (this.rabbitMQService) {
            await this.rabbitMQService.publish(
              MessagePatterns.ORDER_STATUS_CHANGED,
              {
                providerKey: data.providerKey,
                orderId: requestId,
                itemId: data.itemId,
                dealType: data.dealType,
                count: data.count,
                clientOrderId: data.clientOrderId,
                status,
                statusStr,
              },
              data.providerKey,
            );
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.formatter.error('ProviderOrder', `Talaab track error for ${requestId}: ${message}`);
      }
    }, 5000);

    this.trackedOrders.set(requestId, {
      providerKey: data.providerKey,
      orderId: requestId,
      itemId: data.itemId,
      dealType: data.dealType,
      count: data.count,
      lastStatus: 0,
      interval,
      clientOrderId: data.clientOrderId,
    });

    this.formatter.log('ProviderOrder', `Started tracking Talaab order ${requestId}`);
  }

  private async checkTalaabOrderStatus(
    apiBaseUrl: string,
    headers: Record<string, string>,
    targetRequestId: string,
  ): Promise<number | null> {
    const response = await firstValueFrom(
      this.httpService.get<TalaabLatestTradesResponse>(
        `${apiBaseUrl}/profile/application-latest-trades`,
        { headers },
      ),
    );

    const trades = response.data.data || [];
    const match = trades.find((t: TalaabLatestTrade) => t.sanad === targetRequestId);
    if (match) {
      return match.status;
    }

    return null;
  }

  private async checkOrderStatus(
    apiBaseUrl: string,
    headers: Record<string, string>,
    targetOrderId: string,
  ): Promise<number | null> {
    const body: ZaryarDealsListRequest = {
      OrderIndex: null,
      PageNumber: 1,
      ItemId: 0,
      DealFilterStatus: 0,
      FromDate: '',
      ToDate: '',
    };

    const response = await firstValueFrom(
      this.httpService.post<ZaryarDealListResponse>(
        `${apiBaseUrl}/api/Deal/DealsList`,
        body,
        { headers },
      ),
    );

    const deals = response.data.Data || [];
    const match = deals.find((d: ZaryarDealItem) => d.OrderId === targetOrderId);
    if (match) {
      return match.DealStatus;
    }

    return null;
  }

  async getTrackedOrders(): Promise<{
    orderId: string;
    providerKey: string;
    itemId: number;
    dealType: number;
    count: number;
    lastStatus: number;
  }[]> {
    return Array.from(this.trackedOrders.values()).map((t) => ({
      orderId: t.orderId,
      providerKey: t.providerKey,
      itemId: t.itemId,
      dealType: t.dealType,
      count: t.count,
      lastStatus: t.lastStatus,
    }));
  }

  async manualPlaceOrder(
    providerKey: string,
    itemId: number,
    dealType: number,
    count: number,
    price?: number,
  ): Promise<{ orderId: string }> {
    return this.placeOrder({ providerKey, itemId, dealType, count, price });
  }

  private buildTalaabHeaders(provider: ProviderEntity): Record<string, string> {
    const auth = provider.auth || {};
    return {
      Authorization: `Bearer ${auth['token'] || ''}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private buildZaryarHeaders(provider: ProviderEntity): Record<string, string> {
    const auth = provider.auth || {};
    return {
      Authorization: `Bearer ${auth['token'] || ''}`,
      'x-request-id': uuid().replace(/-/g, ''),
      roleType: auth['roleType'] || '0',
      sessionId: auth['sessionId'] || '',
      shopkeeperId: auth['shopkeeperId'] || '',
      'Content-Type': 'application/json',
    };
  }
}
