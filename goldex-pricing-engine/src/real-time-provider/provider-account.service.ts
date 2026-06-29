import { Injectable, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, Between } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import { ProviderEntity } from './entity/provider.entity';
import { ProviderDealEntity } from './entity/provider-deal.entity';
import { ProviderBalanceEntity } from './entity/provider-balance.entity';
import { RabbitMQService, MessagePatterns } from '../rabbitmq/rabbitmq.module';
import { ProviderCategory } from './types/enums';
import {
  ZaryarDealItem,
  ZaryarDealDatesResponse,
  ZaryarDealListResponse,
  ZaryarDealsListRequest,
  ZaryarDealDateItem,
} from './types/zaryar-deal.types';
import {
  TalaabTransaction,
  TalaabTransactionsResponse,
  TalaabBalanceResponse,
} from './types/talaab-finance.types';

@Injectable()
export class ProviderAccountService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(ProviderEntity)
    private providerRepo: Repository<ProviderEntity>,
    @InjectRepository(ProviderDealEntity)
    private dealRepo: Repository<ProviderDealEntity>,
    @InjectRepository(ProviderBalanceEntity)
    private balanceRepo: Repository<ProviderBalanceEntity>,
    private readonly httpService: HttpService,
    private readonly formatter: ConsoleFormatterService,
    private readonly rabbitMQService?: RabbitMQService,
  ) {}

  // On startup, broadcast each provider's completed-deal balance over RabbitMQ so
  // the backend's snapshot reflects existing deals without a fresh provider fetch.
  async onApplicationBootstrap(): Promise<void> {
    try {
      const rows = await this.dealRepo
        .createQueryBuilder('d')
        .select('DISTINCT d.providerKey', 'providerKey')
        .where('d.dealStatus = :done', { done: 1 })
        .getRawMany();
      for (const r of rows) {
        await this.publishDealBalance(r.providerKey);
      }
      this.formatter.log(
        'ProviderAccount',
        `Published deal balances for ${rows.length} provider(s) on startup`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderAccount', `Deal-balance bootstrap failed: ${message}`);
    }
  }

  // Aggregate a provider's COMPLETED (dealStatus=1) deals and publish the result
  // over RabbitMQ (PROVIDER_DEALS_UPDATED) for the backend to snapshot.
  async publishDealBalance(providerKey: string): Promise<void> {
    if (!this.rabbitMQService) return;
    const deals = await this.dealRepo.find({ where: { providerKey, dealStatus: 1 } });

    let totalVolume = 0;
    let totalValue = 0;
    let buyVolume = 0;
    let sellVolume = 0;
    let buyValue = 0;
    let sellValue = 0;
    let lastDealAt: Date | null = null;
    for (const d of deals) {
      const vol = Number(d.gramVolume ?? d.count ?? 0);
      // Value is reckoned at the CUSTOMER gram price (display) whenever it's known
      // (our order-placed deals); otherwise fall back to the provider's reported
      // totalPrice, then the pure gram price.
      const cgp = Number(d.customerGramPrice ?? 0);
      const val = cgp > 0 ? vol * cgp : Number(d.totalPrice ?? 0) || vol * Number(d.gramPrice ?? 0);
      totalVolume += vol;
      totalValue += val;
      // dealTypeStr is set for fetched deals; order-placed deals only set the
      // numeric dealType (0 = buy, 1 = sell).
      const t = d.dealTypeStr || '';
      const isBuy = t.includes('خرید') || (t === '' && d.dealType === 0);
      const isSell = t.includes('فروش') || (t === '' && d.dealType === 1);
      if (isBuy) {
        buyVolume += vol;
        buyValue += val;
      } else if (isSell) {
        sellVolume += vol;
        sellValue += val;
      }
      if (d.orderDate && (!lastDealAt || d.orderDate > lastDealAt)) lastDealAt = d.orderDate;
    }

    await this.rabbitMQService.publish(
      MessagePatterns.PROVIDER_DEALS_UPDATED,
      {
        providerKey,
        doneDeals: {
          dealCount: deals.length,
          totalVolume,
          totalValue,
          buyVolume,
          sellVolume,
          buyValue,
          sellValue,
          // Net gold position (XAU) and net cash position (IRR) with the provider.
          netVolume: buyVolume - sellVolume,
          netValue: sellValue - buyValue,
          lastDealAt,
        },
      },
      providerKey,
    );
  }

  async getLastOrderDate(providerKey: string): Promise<string | null> {
    const last = await this.dealRepo.findOne({
      where: { providerKey },
      order: { orderDate: 'DESC' },
    });
    if (last?.orderDateStr) return last.orderDateStr;
    if (last?.orderDate) {
      return last.orderDate.toISOString().split('T')[0].replace(/-/g, '/');
    }
    return null;
  }

  async getLastBalanceSnapshotDate(providerKey: string): Promise<string | null> {
    const last = await this.balanceRepo.findOne({
      where: { providerKey },
      order: { createdAt: 'DESC' },
    });
    return last?.snapshotDate || null;
  }

  async getLastTransactionSanad(providerKey: string): Promise<number | null> {
    const last = await this.dealRepo.findOne({
      where: { providerKey, providerCategory: ProviderCategory.TALAAB },
      order: { createdAt: 'DESC' },
    });
    if (last?.orderCode) return parseInt(last.orderCode);
    return null;
  }

  async syncAllActiveProviders(): Promise<void> {
    const providers = await this.providerRepo.find({ where: { active: true } });
    for (const provider of providers) {
      try {
        await this.fetchOrders(provider.key);
        if (provider.category === ProviderCategory.TALAAB) {
          await this.fetchBalance(provider.key);
        }
        this.formatter.log('ProviderAccount', `Synced ${provider.key} on startup`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.formatter.error(
          'ProviderAccount',
          `Startup sync failed for ${provider.key}: ${message}`,
        );
      }
    }
  }

  async fetchOrders(providerKey: string): Promise<{ count: number }> {
    const provider = await this.providerRepo.findOne({ where: { key: providerKey } });
    if (!provider) throw new NotFoundException(`Provider ${providerKey} not found`);

    if (provider.category === ProviderCategory.ZARYAR) {
      return this.fetchZaryarDeals(provider);
    }
    if (provider.category === ProviderCategory.TALAAB) {
      return this.fetchTalaabTransactions(provider);
    }
    throw new Error(`Unsupported category: ${provider.category}`);
  }

  async fetchBalance(providerKey: string): Promise<ProviderBalanceEntity> {
    const provider = await this.providerRepo.findOne({ where: { key: providerKey } });
    if (!provider) throw new NotFoundException(`Provider ${providerKey} not found`);

    if (provider.category === ProviderCategory.TALAAB) {
      return this.fetchTalaabBalance(provider);
    }
    throw new Error(`Balance fetching not supported for category: ${provider.category}`);
  }

  async getOrders(
    providerKey: string,
    filters?: {
      fromDate?: string;
      toDate?: string;
      dealType?: number;
      dealStatus?: number;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: ProviderDealEntity[]; total: number }> {
    const query: any = { providerKey };

    if (filters?.dealType !== undefined) query.dealType = filters.dealType;
    if (filters?.dealStatus !== undefined) query.dealStatus = filters.dealStatus;

    if (filters?.fromDate && filters?.toDate) {
      query.orderDate = Between(new Date(filters.fromDate), new Date(filters.toDate));
    } else if (filters?.fromDate) {
      query.orderDate = MoreThanOrEqual(new Date(filters.fromDate));
    } else if (filters?.toDate) {
      query.orderDate = LessThanOrEqual(new Date(filters.toDate));
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const [data, total] = await this.dealRepo.findAndCount({
      where: query,
      order: { orderDate: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total };
  }

  async getBalance(providerKey: string): Promise<ProviderBalanceEntity | null> {
    return this.balanceRepo.findOne({
      where: { providerKey },
      order: { createdAt: 'DESC' },
    });
  }

  async getIntegratedSummary(): Promise<{
    balances: Record<string, ProviderBalanceEntity | null>;
    orderCounts: Record<string, number>;
    recentOrders: ProviderDealEntity[];
  }> {
    const providers = await this.providerRepo.find();
    const balances: Record<string, ProviderBalanceEntity | null> = {};
    const orderCounts: Record<string, number> = {};

    for (const provider of providers) {
      balances[provider.key] = await this.getBalance(provider.key);
      orderCounts[provider.key] = await this.dealRepo.count({
        where: { providerKey: provider.key },
      });
    }

    const recentOrders = await this.dealRepo.find({
      order: { orderDate: 'DESC' },
      take: 20,
    });

    return { balances, orderCounts, recentOrders };
  }

  private async fetchZaryarDeals(provider: ProviderEntity): Promise<{ count: number }> {
    const apiBaseUrl = provider.apiBaseUrl || provider.baseUrl.replace('/signalr', '');
    const headers = this.buildZaryarHeaders(provider);

    const lastDateStr = await this.getLastOrderDate(provider.key);

    let allDeals: ZaryarDealItem[] = [];
    let pageNumber = 1;
    let lastOrderIndex: number | null = null;

    try {
      const datesResponse = await firstValueFrom(
        this.httpService.post<ZaryarDealDatesResponse>(
          `${apiBaseUrl}/api/Deal/GetDealsDate`,
          { PageNumber: 1, ToDate: '' },
          { headers },
        ),
      );

      let dateItems = datesResponse.data.Data || [];
      if (dateItems.length === 0) {
        this.formatter.log('ProviderAccount', `No deal dates found for ${provider.key}`);
        return { count: 0 };
      }

      if (lastDateStr) {
        const lastIdx = dateItems.findIndex((d) => d.Date === lastDateStr);
        if (lastIdx >= 0) {
          dateItems = dateItems.slice(0, lastIdx + 1);
        }
        this.formatter.log(
          'ProviderAccount',
          `Incremental fetch for ${provider.key}, dates after ${lastDateStr}: ${dateItems.length} date(s)`,
        );
      } else {
        this.formatter.log(
          'ProviderAccount',
          `Full fetch for ${provider.key}: ${dateItems.length} date(s)`,
        );
      }

      for (const dateItem of dateItems) {
        let page = 1;
        let orderIndex: number | null = null;

        while (true) {
          const body: ZaryarDealsListRequest = {
            OrderIndex: orderIndex,
            PageNumber: page,
            ItemId: 0,
            DealFilterStatus: 0,
            FromDate: dateItem.Date,
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
          if (deals.length === 0) break;

          allDeals = allDeals.concat(deals);
          await this.saveZaryarDeals(provider.key, deals);

          if (!response.data.OrderIndex) break;
          orderIndex = response.data.OrderIndex;
          page++;
        }
      }

      this.formatter.log('ProviderAccount', `Fetched ${allDeals.length} deals for ${provider.key}`);

      await this.publishDealBalance(provider.key);

      return { count: allDeals.length };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderAccount', `Failed to fetch deals: ${message}`);
      throw error;
    }
  }

  private async saveZaryarDeals(providerKey: string, deals: ZaryarDealItem[]): Promise<void> {
    for (const deal of deals) {
      try {
        const existing = await this.dealRepo.findOne({
          where: { providerKey, orderId: deal.OrderId },
        });

        const entity = {
          providerKey,
          providerCategory: ProviderCategory.ZARYAR,
          orderId: deal.OrderId,
          orderCode: deal.OrderCode,
          factorCode: deal.FactorCode,
          itemName: deal.ItemName,
          itemId: deal.ItemId,
          count: deal.Count,
          totalPrice: deal.TotalPrice,
          dealType: deal.DealType,
          dealTypeStr: deal.DealTypeStr,
          dealStatus: deal.DealStatus,
          orderStatusStr: deal.OrderStatusStr,
          mazane: deal.Mazane,
          mazaneStr: deal.MazaneStr,
          orderDate: new Date(deal.OrderDate),
          orderDateStr: deal.OrderDateStr,
          carat: deal.Carat,
          weight750: deal.Weight750,
          rawData: deal as any,
        };

        if (existing) {
          await this.dealRepo.update(existing.id, entity);
        } else {
          await this.dealRepo.save(this.dealRepo.create(entity));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.formatter.error(
          'ProviderAccount',
          `Failed to save deal ${deal.OrderCode}: ${message}`,
        );
      }
    }
  }

  private async fetchTalaabTransactions(provider: ProviderEntity): Promise<{ count: number }> {
    const apiBaseUrl =
      provider.apiBaseUrl?.replace('/homepage', '') || 'https://api.afroghnegaremana.ir/api/v1';
    const headers = this.buildTalaabHeaders(provider);

    const lastSanad = await this.getLastTransactionSanad(provider.key);

    try {
      let allTransactions: TalaabTransaction[] = [];
      let currentPage = 1;
      let hasReachedExisting = false;

      while (true) {
        const response = await firstValueFrom(
          this.httpService.get<TalaabTransactionsResponse>(`${apiBaseUrl}/finance/transactions`, {
            headers,
            params: { status: 1, page: currentPage },
          }),
        );

        const txns = response.data.data?.list || [];
        if (txns.length === 0) break;

        const newTxns: TalaabTransaction[] = [];
        for (const txn of txns) {
          if (lastSanad !== null && txn.sanad <= lastSanad) {
            hasReachedExisting = true;
            break;
          }
          newTxns.push(txn);
        }

        if (newTxns.length > 0) {
          allTransactions = allTransactions.concat(newTxns);
          await this.saveTalaabTransactions(provider.key, newTxns);
        }

        if (hasReachedExisting || !response.data.data?.has_more_page) break;
        currentPage++;
      }

      if (lastSanad === null) {
        this.formatter.log(
          'ProviderAccount',
          `Fetched ${allTransactions.length} transactions for ${provider.key} (full sync)`,
        );
      } else {
        this.formatter.log(
          'ProviderAccount',
          `Fetched ${allTransactions.length} new transactions for ${provider.key} (since sanad ${lastSanad})`,
        );
      }

      await this.publishDealBalance(provider.key);

      return { count: allTransactions.length };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderAccount', `Failed to fetch transactions: ${message}`);
      throw error;
    }
  }

  private async saveTalaabTransactions(
    providerKey: string,
    transactions: TalaabTransaction[],
  ): Promise<void> {
    for (const txn of transactions) {
      try {
        const orderId = `txn-${txn.sanad}`;

        const existing = await this.dealRepo.findOne({
          where: { providerKey, orderId },
        });

        const isCustomerBuy = txn.title?.includes('خريد');
        const goldAffect = parseFloat(txn.affect?.gold?.balance || '0');
        const rialAffect = parseFloat(txn.affect?.rial?.balance || '0');

        const carat = this.extractTalaabNumber(txn.description, 'عیار');
        const weight = this.extractTalaabNumber(txn.description, 'وزن');
        const mazane = this.extractTalaabNumber(txn.description, 'مظنه');
        const itemId = this.mapTalaabItemId(txn.title, txn.description);

        const isShopSell = txn.title?.includes('خريد');
        const isShopBuy = txn.title?.includes('فروش');

        const entity = {
          providerKey,
          providerCategory: ProviderCategory.TALAAB,
          orderId,
          orderCode: String(txn.sanad),
          itemName: txn.title,
          itemId,
          dealType: isShopBuy ? 0 : 1,
          dealTypeStr: isShopBuy ? 'خرید' : 'فروش',
          orderStatusStr: 'انجام شده',
          dealStatus: 1,
          count: Math.abs(goldAffect),
          totalPrice: Math.abs(parseFloat(txn.affect?.rial?.balance || '0')),
          mazane,
          mazaneStr: mazane ? mazane.toLocaleString() : null,
          carat,
          weight750: weight,
          orderDate: this.parsePersianDate(txn.date, txn.time),
          rawData: txn as any,
        };

        if (existing) {
          await this.dealRepo.update(existing.id, entity);
        } else {
          await this.dealRepo.save(this.dealRepo.create(entity));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.formatter.error(
          'ProviderAccount',
          `Failed to save transaction ${txn.sanad}: ${message}`,
        );
      }
    }
  }

  private extractTalaabNumber(description: string, keyword: string): number {
    if (!description) return 0;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = description.match(new RegExp(`${escaped}\\s*([\\d,]+)`));
    if (match) {
      return parseFloat(match[1].replace(/,/g, '')) || 0;
    }
    return 0;
  }

  private mapTalaabItemId(title: string, description: string): number {
    const text = `${title || ''} ${description || ''}`;
    if (text.includes('سکه')) return 4;
    if (text.includes('نقره')) return 5;
    if (text.includes('ربع') || text.includes('رفی')) return 6;
    return 1;
  }

  private async fetchTalaabBalance(provider: ProviderEntity): Promise<ProviderBalanceEntity> {
    const apiBaseUrl =
      provider.apiBaseUrl?.replace('/homepage', '') ||
      'https://api.afroghnegaremana.ir/api/v1/profile';
    const headers = this.buildTalaabHeaders(provider);

    try {
      const response = await firstValueFrom(
        this.httpService.get<TalaabBalanceResponse>(`${apiBaseUrl}/finance/balance`, { headers }),
      );

      const data = response.data.data;
      const snapshotDate = data.date || new Date().toISOString().split('T')[0];

      const existing = await this.balanceRepo.findOne({
        where: { providerKey: provider.key, snapshotDate },
      });

      const entity = {
        providerKey: provider.key,
        providerCategory: ProviderCategory.TALAAB,
        goldBalance: parseFloat(data.gold?.balance || '0'),
        goldUnit: data.gold?.unit || 'گرم',
        rialBalance: parseFloat(data.rial?.balance || '0'),
        rialUnit: data.rial?.unit || 'ریال',
        totalTaraz: data.taraz || 0,
        snapshotDate,
        rawData: data as any,
      };

      let saved: ProviderBalanceEntity;
      if (existing) {
        await this.balanceRepo.update(existing.id, entity);
        saved = { ...existing, ...entity } as ProviderBalanceEntity;
      } else {
        saved = await this.balanceRepo.save(this.balanceRepo.create(entity));
      }

      this.formatter.log(
        'ProviderAccount',
        `Balance fetched for ${provider.key}: gold=${data.gold?.balance}, rial=${data.rial?.balance}`,
      );

      if (this.rabbitMQService) {
        await this.rabbitMQService.publish(
          MessagePatterns.PROVIDER_BALANCE_UPDATED,
          {
            providerKey: provider.key,
            goldBalance: data.gold?.balance,
            rialBalance: data.rial?.balance,
          },
          provider.key,
        );
      }

      return saved;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderAccount', `Failed to fetch balance: ${message}`);
      throw error;
    }
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

  private buildTalaabHeaders(provider: ProviderEntity): Record<string, string> {
    const auth = provider.auth || {};
    return {
      Authorization: `Bearer ${auth['token'] || ''}`,
      Accept: 'application/json',
    };
  }

  private parsePersianDate(date: string, time: string): Date {
    try {
      const parts = date.split('/');
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);

        if (year >= 1300) {
          const gregorian = this.persianToGregorian(year, month, day);
          if (time) {
            const timeParts = time.split(':');
            gregorian.setHours(
              parseInt(timeParts[0]) || 0,
              parseInt(timeParts[1]) || 0,
              parseInt(timeParts[2]) || 0,
            );
          }
          return gregorian;
        }
      }
      return new Date(date + 'T' + (time || '00:00:00'));
    } catch {
      return new Date();
    }
  }

  private isPersianLeapYear(year: number): boolean {
    const pos = ((year - 1) % 33) + 1;
    return [1, 5, 9, 13, 17, 22, 26, 30].includes(pos);
  }

  private persianToGregorian(year: number, month: number, day: number): Date {
    const daysSinceEpoch = (y: number, m: number, d: number): number => {
      let total = 0;
      for (let yr = 1; yr < y; yr++) {
        total += this.isPersianLeapYear(yr) ? 366 : 365;
      }
      const monthLen = [
        31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30,
        this.isPersianLeapYear(y) ? 30 : 29,
      ];
      for (let mo = 0; mo < m - 1; mo++) {
        total += monthLen[mo];
      }
      total += d - 1;
      return total;
    };

    const refTarget = daysSinceEpoch(year, month, day);
    const ref1405 = daysSinceEpoch(1405, 1, 1);
    const diffDays = refTarget - ref1405;

    const base = new Date(2026, 2, 21);
    base.setDate(base.getDate() + diffDays);
    return base;
  }
}
