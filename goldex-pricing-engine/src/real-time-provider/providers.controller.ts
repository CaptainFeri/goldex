import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  HttpException,
  HttpStatus,
  Body,
  Patch,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ProviderManagerService } from './provider-manage.service';
import { ItemMetadataService } from './item-metadata.service';
import { PriceData, RedisService } from '../redis/redis.service';
import { ProviderService } from './provider.service';
import { ProviderAccountService } from './provider-account.service';
import { ProviderOrderService } from './provider-order.service';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProviderDto } from './dto/provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { CreateProviderDto } from './dto/create-provider.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SendOtpDto } from './dto/send-otp.dto';

@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly providerManager: ProviderManagerService,
    private readonly metadataService: ItemMetadataService,
    private readonly redisService: RedisService,
    private readonly providerService: ProviderService,
    private readonly accountService: ProviderAccountService,
    private readonly orderService: ProviderOrderService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new provider (inactive)' })
  @ApiResponse({ status: 201, type: ProviderDto })
  create(@Body() createDto: CreateProviderDto) {
    return this.providerService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all providers' })
  @ApiResponse({ status: 200, type: [ProviderDto] })
  findAll() {
    return this.providerService.findAll();
  }

  // ── Literal routes MUST come before parameterized :id ──

  @Get('health')
  @ApiOperation({ summary: 'Runtime connection state of all running providers' })
  getHealth() {
    return { data: this.providerManager.getHealthReport() };
  }

  @Post('reconcile')
  @ApiOperation({
    summary: 'Force a health-check pass: sync DB active flags with running providers',
  })
  async reconcile() {
    const data = await this.providerManager.reconcileProviders();
    return { data };
  }

  @Get('all-prices')
  async getAllPricesFromAllProviders() {
    const allProviders = Array.from(this.providerManager.getAllProviders().keys());
    const result: Record<string, PriceData[]> = {};
    for (const providerKey of allProviders) {
      result[providerKey] = await this.redisService.getAllCurrentPrices(providerKey);
    }
    return { data: result };
  }

  @Get('integrated-prices')
  async getIntegratedPrices() {
    const allProviders = Array.from(this.providerManager.getAllProviders().keys());
    const integrated: Record<string, PriceData[]> = {};
    let combined: PriceData[] = [];
    for (const providerKey of allProviders) {
      const prices = await this.redisService.getAllCurrentPrices(providerKey);
      integrated[providerKey] = prices;
      combined = combined.concat(prices);
    }
    integrated.combined = combined;
    return { data: integrated };
  }

  @Get('market-map')
  async getMarketMap() {
    const providers = Array.from(this.providerManager.getAllProviders().keys());
    const result: Record<string, unknown> = {};

    for (const providerKey of providers) {
      const metadata = await this.metadataService.getAllMetadataForProvider(providerKey);
      const prices = await this.redisService.getAllCurrentPrices(providerKey);

      const priceMap = new Map<number, PriceData>();
      for (const price of prices) {
        priceMap.set(price.itemId, price);
      }

      const itemsMap: Record<string, unknown> = {};
      for (const item of metadata) {
        const price = priceMap.get(item.itemId);
        itemsMap[String(item.itemId)] = {
          name: item.name,
          unit: item.unit,
          groupId: item.groupId,
          groupName: item.groupName,
          buyPrice: price?.buyPrice ?? null,
          sellPrice: price?.sellPrice ?? null,
          buyPricePerGram: price?.buyPricePerGram ?? null,
          sellPricePerGram: price?.sellPricePerGram ?? null,
          canBuy: price?.canBuy ?? false,
          canSell: price?.canSell ?? false,
          lastUpdate: price?.timestamp ?? null,
        };
      }

      result[providerKey] = {
        items: itemsMap,
        lastUpdate: Object.values(itemsMap).reduce((latest: Date | null, item: unknown) => {
          const it = item as { lastUpdate?: string | null };
          if (it.lastUpdate) {
            const ts = new Date(it.lastUpdate);
            if (!latest || ts > latest) return ts;
          }
          return latest;
        }, null),
      };
    }

    return { data: result };
  }

  @Get('consolidated-market')
  async getConsolidatedMarket() {
    const providers = Array.from(this.providerManager.getAllProviders().keys());
    const result: Record<string, unknown> = {
      coins: {},
      molten: {},
      silver: {},
    };

    for (const providerKey of providers) {
      const metadata = await this.metadataService.getAllMetadataForProvider(providerKey);
      const prices = await this.redisService.getAllCurrentPrices(providerKey);
      const priceMap = new Map(prices.map((p) => [p.itemId, p]));

      for (const item of metadata) {
        const price = priceMap.get(item.itemId);
        const itemData: Record<string, unknown> = {
          name: item.name,
          unit: item.unit,
          buyPrice: price?.buyPrice ?? null,
          sellPrice: price?.sellPrice ?? null,
          buyPricePerGram: price?.buyPricePerGram ?? null,
          sellPricePerGram: price?.sellPricePerGram ?? null,
          canBuy: price?.canBuy ?? false,
          canSell: price?.canSell ?? false,
          lastUpdate: price?.timestamp ?? null,
          provider: providerKey,
        };

        const categoryMap: Record<number, string> = {
          1: 'molten',
          2: 'coins',
          3: 'silver',
        };
        const category = categoryMap[item.groupId];
        if (!category) continue;

        const cat = result[category] as Record<string, Record<string, unknown>>;
        if (!cat[item.name]) {
          cat[item.name] = {};
        }
        cat[item.name][providerKey] = itemData;
      }
    }

    for (const category of ['coins', 'molten', 'silver']) {
      const items = result[category] as Record<string, Record<string, unknown>>;
      if (Object.keys(items).length === 0) continue;

      const entries = Object.entries(items);
      entries.sort((a, b) => {
        const aProviders = a[1];
        const bProviders = b[1];

        let aMaxBuy = 0;
        for (const p of Object.values(aProviders)) {
          const buyPrice = (p as Record<string, unknown>).buyPrice as number;
          if (buyPrice && buyPrice > aMaxBuy) aMaxBuy = buyPrice;
        }
        let bMaxBuy = 0;
        for (const p of Object.values(bProviders)) {
          const buyPrice = (p as Record<string, unknown>).buyPrice as number;
          if (buyPrice && buyPrice > bMaxBuy) bMaxBuy = buyPrice;
        }
        if (aMaxBuy !== bMaxBuy) return bMaxBuy - aMaxBuy;

        let aMinSell = Infinity;
        for (const p of Object.values(aProviders)) {
          const sellPrice = (p as Record<string, unknown>).sellPrice as number;
          if (sellPrice && sellPrice < aMinSell) aMinSell = sellPrice;
        }
        let bMinSell = Infinity;
        for (const p of Object.values(bProviders)) {
          const sellPrice = (p as Record<string, unknown>).sellPrice as number;
          if (sellPrice && sellPrice < bMinSell) bMinSell = sellPrice;
        }
        if (aMinSell !== bMinSell) return aMinSell - bMinSell;

        return a[0].localeCompare(b[0]);
      });

      const sortedItems: Record<string, Record<string, unknown>> = {};
      for (const [itemName, providers] of entries) {
        sortedItems[itemName] = providers;
      }
      result[category] = sortedItems;
    }

    return { data: result };
  }

  @Get('best-prices')
  @ApiOperation({ summary: 'Best buy/sell prices per item group across all providers' })
  async getBestPrices() {
    // Collect from running providers + scan all registered providers for cached Redis data
    const runningKeys = Array.from(this.providerManager.getAllProviders().keys());
    const allRegistered = await this.providerService.findAll();
    const allProviderKeys = new Set([...runningKeys, ...allRegistered.map((p) => p.key)]);
    const allPrices: { providerKey: string; price: PriceData }[] = [];

    for (const providerKey of allProviderKeys) {
      try {
        const prices = await this.redisService.getAllCurrentPrices(providerKey);
        for (const price of prices) {
          price.providerKey = providerKey;
          allPrices.push({ providerKey, price });
        }
      } catch {
        // skip providers with no Redis data
      }
    }

    // Build item-centric view grouped by groupName
    // itemKey = itemName (same item across providers)
    const groups: Record<
      string,
      {
        items: Record<
          string,
          {
            unit: string;
            groupId: number;
            providers: Record<
              string,
              {
                buyPrice: number;
                sellPrice: number;
                buyPriceStr: string;
                sellPriceStr: string;
                canBuy: boolean;
                canSell: boolean;
                spread: number;
                spreadPercent: number;
                timestamp: string;
              }
            >;
          }
        >;
      }
    > = {};

    for (const { providerKey, price } of allPrices) {
      const groupName = price.groupName || 'سایر';
      const itemName = price.itemName || `Item #${price.itemId}`;

      if (!groups[groupName]) groups[groupName] = { items: {} };
      if (!groups[groupName].items[itemName]) {
        groups[groupName].items[itemName] = {
          unit: price.unit || '',
          groupId: price.groupId || 0,
          providers: {},
        };
      }

      const item = groups[groupName].items[itemName];
      if (price.unit) item.unit = price.unit;
      if (price.groupId) item.groupId = price.groupId;

      item.providers[providerKey] = {
        buyPrice: price.buyPrice,
        sellPrice: price.sellPrice,
        buyPriceStr: price.buyPriceStr,
        sellPriceStr: price.sellPriceStr,
        canBuy: price.canBuy,
        canSell: price.canSell,
        spread: price.spread,
        spreadPercent: price.spreadPercent,
        timestamp: price.timestamp,
      };
    }

    // Compute best prices per item
    const result: Record<
      string,
      {
        items: Record<
          string,
          {
            unit: string;
            groupId: number;
            bestBuy: { price: number; priceStr: string; provider: string } | null;
            bestSell: { price: number; priceStr: string; provider: string } | null;
            spread: number;
            spreadPercent: number;
            allProviders: string[];
            lastUpdate: string | null;
          }
        >;
        totalItems: number;
      }
    > = {};

    for (const [groupName, group] of Object.entries(groups)) {
      const items: Record<
        string,
        {
          unit: string;
          groupId: number;
          bestBuy: { price: number; priceStr: string; provider: string } | null;
          bestSell: { price: number; priceStr: string; provider: string } | null;
          spread: number;
          spreadPercent: number;
          allProviders: string[];
          lastUpdate: string | null;
        }
      > = {};
      for (const [itemName, item] of Object.entries(group.items)) {
        const providers = Object.entries(item.providers);

        // Best buy = highest price someone will buy at (sell to them)
        const buys = providers
          .filter(([, p]) => p.canBuy && p.buyPrice > 0)
          .sort(([, a], [, b]) => b.buyPrice - a.buyPrice);

        // Best sell = lowest price someone will sell at (buy from them)
        const sells = providers
          .filter(([, p]) => p.canSell && p.sellPrice > 0)
          .sort(([, a], [, b]) => a.sellPrice - b.sellPrice);

        const bestBuy = buys.length > 0 ? buys[0] : null;
        const bestSell = sells.length > 0 ? sells[0] : null;

        const bestBuyPrice = bestBuy ? bestBuy[1].buyPrice : null;
        const bestSellPrice = bestSell ? bestSell[1].sellPrice : null;
        const spread =
          bestBuyPrice !== null && bestSellPrice !== null ? bestBuyPrice - bestSellPrice : 0;
        const spreadPercent =
          bestSellPrice && bestSellPrice > 0 ? (spread / bestSellPrice) * 100 : 0;

        const allTimestamps = providers.map(([, p]) => p.timestamp).filter(Boolean) as string[];
        const lastUpdate =
          allTimestamps.length > 0
            ? allTimestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
            : null;

        items[itemName] = {
          unit: item.unit,
          groupId: item.groupId,
          bestBuy: bestBuy
            ? { price: bestBuy[1].buyPrice, priceStr: bestBuy[1].buyPriceStr, provider: bestBuy[0] }
            : null,
          bestSell: bestSell
            ? {
                price: bestSell[1].sellPrice,
                priceStr: bestSell[1].sellPriceStr,
                provider: bestSell[0],
              }
            : null,
          spread,
          spreadPercent,
          allProviders: providers.map(([k]) => k),
          lastUpdate,
        };
      }
      result[groupName] = { items, totalItems: Object.keys(items).length };
    }

    return { data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a provider by ID' })
  @ApiResponse({ status: 200, type: ProviderDto })
  findOne(@Param('id') id: string) {
    return this.providerService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a provider' })
  @ApiResponse({ status: 200, type: ProviderDto })
  async update(@Param('id') id: string, @Body() updateDto: UpdateProviderDto) {
    return this.providerService.update(id, updateDto);
  }

  @Post(':id/send-otp')
  @ApiOperation({ summary: 'Send OTP to provider phone' })
  async sendOtp(@Param('id') id: string, @Body() sendOtpDto: SendOtpDto) {
    return this.providerService.sendOtp(id, sendOtpDto.phone);
  }

  @Post(':id/verify-otp')
  @ApiOperation({ summary: 'Verify OTP and activate provider' })
  async verifyOtp(@Param('id') id: string, @Body() verifyOtpDto: VerifyOtpDto) {
    return this.providerService.verifyOtp(id, verifyOtpDto.otp);
  }

  @Post(':id/toggle-active')
  @ApiOperation({ summary: 'Toggle provider active status' })
  async toggleActive(@Param('id') id: string) {
    return this.providerService.toggleActive(id);
  }

  @Get(':providerKey/tracked-items')
  async getTrackedItems(@Param('providerKey') providerKey: string) {
    const provider = this.providerManager.getProvider(providerKey);
    if (!provider) {
      throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);
    }
    const metadata = await this.metadataService.getAllMetadataForProvider(providerKey);
    const trackedIds = metadata.map((m) => m.itemId);
    return {
      data: {
        providerKey,
        trackedItemIds: trackedIds,
        count: trackedIds.length,
      },
    };
  }

  @Get(':providerKey/status')
  getProviderStatus(@Param('providerKey') providerKey: string) {
    const provider = this.providerManager.getProvider(providerKey);
    if (!provider) {
      throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);
    }
    return {
      data: {
        key: provider.config.key,
        category: provider.config.category,
        connected: provider.isConnected(),
        baseUrl: provider.config.baseUrl,
      },
    };
  }

  @Get(':providerKey/prices')
  async getPrices(@Param('providerKey') providerKey: string, @Query('itemId') itemId?: string) {
    const provider = this.providerManager.getProvider(providerKey);
    if (!provider) {
      throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);
    }

    if (itemId) {
      const price = await provider.getPrice(parseInt(itemId));
      return { data: price };
    } else {
      const prices = await this.providerManager.getPricesForProvider(providerKey);
      return { data: prices };
    }
  }

  @Get(':providerKey/deal/:itemId')
  async getDealView(
    @Param('providerKey') providerKey: string,
    @Param('itemId') itemId: string,
    @Query('dealType') dealType?: string,
  ) {
    const provider = this.providerManager.getProvider(providerKey);
    if (!provider) {
      throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);
    }
    const dealView = await provider.getDealView(
      parseInt(itemId),
      dealType ? parseInt(dealType) : 0,
    );
    return { data: dealView };
  }

  @Post(':providerKey/refresh')
  async refreshProvider(@Param('providerKey') providerKey: string) {
    await this.providerManager.restartProvider(providerKey);
    return {
      data: { success: true, message: `Provider ${providerKey} reconnected` },
    };
  }

  @Get(':providerKey/items')
  async getItems(@Param('providerKey') providerKey: string) {
    const provider = this.providerManager.getProvider(providerKey);
    if (!provider) {
      throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);
    }
    const metadata = await this.metadataService.getAllMetadataForProvider(providerKey);
    return { data: metadata };
  }

  @Get(':providerKey/orders')
  async getOrders(
    @Param('providerKey') providerKey: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('dealType') dealType?: string,
    @Query('dealStatus') dealStatus?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    const result = await this.accountService.getOrders(providerKey, {
      fromDate,
      toDate,
      dealType: dealType ? parseInt(dealType) : undefined,
      dealStatus: dealStatus ? parseInt(dealStatus) : undefined,
      page,
      limit,
    });
    return { data: result.data, total: result.total, page, limit };
  }

  @Post(':providerKey/fetch-orders')
  async fetchOrders(@Param('providerKey') providerKey: string) {
    const result = await this.accountService.fetchOrders(providerKey);
    return { data: result };
  }

  @Get(':providerKey/balance')
  async getBalance(@Param('providerKey') providerKey: string) {
    const balance = await this.accountService.getBalance(providerKey);
    return { data: balance };
  }

  @Post(':providerKey/fetch-balance')
  async fetchBalance(@Param('providerKey') providerKey: string) {
    const balance = await this.accountService.fetchBalance(providerKey);
    return { data: balance };
  }

  @Get('account/summary')
  async getAccountSummary() {
    const summary = await this.accountService.getIntegratedSummary();
    return { data: summary };
  }

  @Post(':providerKey/place-order')
  async placeOrder(
    @Param('providerKey') providerKey: string,
    @Body('itemId') itemId: number,
    @Body('dealType') dealType: number,
    @Body('count') count: number,
    @Body('price') price?: number,
  ) {
    const result = await this.orderService.manualPlaceOrder(providerKey, itemId, dealType, count, price);
    return { data: result };
  }

  @Get('tracked-orders')
  async getTrackedOrders() {
    const orders = await this.orderService.getTrackedOrders();
    return { data: orders };
  }
}
