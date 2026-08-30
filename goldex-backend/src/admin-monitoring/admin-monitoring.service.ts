import { Injectable } from "@nestjs/common";
import { PricingRedisService } from "./pricing-redis.service";
import { ProviderPairMappingService } from "../provider-pair-mapping/provider-pair-mapping.service";

export interface ComparePoint {
  timestamp: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
}

export interface CompareSeries {
  providerKey: string;
  providerItemId: number;
  useBuyPrice: boolean;
  useSellPrice: boolean;
  points: ComparePoint[];
}

@Injectable()
export class AdminMonitoringService {
  constructor(
    private readonly pricingRedis: PricingRedisService,
    private readonly mappingService: ProviderPairMappingService
  ) {}

  getProviders() {
    return this.pricingRedis.getProviders();
  }

  getHistory(providerKey: string, itemId: number, limit: number) {
    return this.pricingRedis.getHistory(providerKey, itemId, limit);
  }

  getCurrent(providerKey: string) {
    return this.pricingRedis.getCurrent(providerKey);
  }

  /**
   * The comparable-chart payload: for a configured pair, return one time-series
   * per provider mapping so the front-office can overlay provider prices.
   */
  async comparePair(
    pairId: string,
    limit: number,
    fromMs?: number,
    toMs?: number
  ): Promise<{ pairId: string; series: CompareSeries[] }> {
    const mappings = await this.mappingService.findByPair(pairId);
    const useRange = fromMs != null || toMs != null;

    const series = await Promise.all(
      mappings.map(async (m): Promise<CompareSeries> => {
        const history = useRange
          ? await this.pricingRedis.getHistoryRange(m.providerKey, m.providerItemId, fromMs, toMs, limit)
          : await this.pricingRedis.getHistory(m.providerKey, m.providerItemId, limit);
        // history is most-recent-first; chronological order is friendlier for charts.
        const points = history
          .map((h) => ({
            timestamp: h.timestamp,
            buyPrice: Number(h.buyPrice) || 0,
            sellPrice: Number(h.sellPrice) || 0,
            spread: Number(h.spread) || 0,
          }))
          .reverse();
        return {
          providerKey: m.providerKey,
          providerItemId: m.providerItemId,
          useBuyPrice: m.useBuyPrice,
          useSellPrice: m.useSellPrice,
          points,
        };
      })
    );

    return { pairId, series };
  }

  /**
   * Aggregate the best buy/sell per item (grouped by groupName) across all
   * providers, reading current prices + item metadata from the engine Redis.
   * Mirrors the pricing-engine's former `best-prices` REST endpoint.
   */
  async getBestPrices(): Promise<Record<string, any>> {
    const providers = await this.pricingRedis.getProviders();
    const byItem: Record<string, any> = {};

    for (const providerKey of providers) {
      const prices = await this.pricingRedis.getCurrent(providerKey);
      for (const p of prices) {
        const group = p.groupName || 'سایر';
        const name = p.itemName || `Item #${p.itemId}`;
        const key = `${group}::${name}`;
        if (!byItem[key]) {
          byItem[key] = {
            group,
            name,
            unit: p.unit || '',
            groupId: p.groupId || 0,
            providers: {},
          };
        }
        const item = byItem[key];
        if (p.unit) item.unit = p.unit;
        if (p.groupId) item.groupId = p.groupId;
        item.providers[providerKey] = {
          buyPrice: Number(p.buyPrice) || 0,
          sellPrice: Number(p.sellPrice) || 0,
          canBuy: !!p.canBuy,
          canSell: !!p.canSell,
          spread: Number(p.spread) || 0,
          timestamp: p.timestamp,
        };
      }
    }

    const result: Record<string, any> = {};
    for (const entry of Object.values(byItem) as any[]) {
      const providers = Object.entries(entry.providers);
      const buys: any[] = (providers as any[])
        .filter((p: any) => p[1].canBuy && p[1].buyPrice > 0)
        .sort((a: any, b: any) => b[1].buyPrice - a[1].buyPrice);
      const sells: any[] = (providers as any[])
        .filter((p: any) => p[1].canSell && p[1].sellPrice > 0)
        .sort((a: any, b: any) => a[1].sellPrice - b[1].sellPrice);

      const bestBuy = buys.length ? buys[0] : null;
      const bestSell = sells.length ? sells[0] : null;

      if (!result[entry.group]) result[entry.group] = { items: {} };
      result[entry.group].items[entry.name] = {
        unit: entry.unit,
        groupId: entry.groupId,
        bestBuy: bestBuy
          ? { price: bestBuy[1].buyPrice, provider: bestBuy[0] }
          : null,
        bestSell: bestSell
          ? { price: bestSell[1].sellPrice, provider: bestSell[0] }
          : null,
        allProviders: providers.map((p) => p[0]),
      };
    }

    for (const group of Object.keys(result)) {
      result[group].totalItems = Object.keys(result[group].items).length;
    }
    return result;
  }

  /**
   * Per-provider item + price map (mirrors the engine's former `market-map`).
   */
  async getMarketMap(): Promise<Record<string, any>> {
    const providers = await this.pricingRedis.getProviders();
    const result: Record<string, any> = {};

    for (const providerKey of providers) {
      const metadata = await this.pricingRedis.getProviderItems(providerKey);
      const prices = await this.pricingRedis.getCurrent(providerKey);
      const priceMap = new Map<number, any>(
        prices.map((p) => [p.itemId, p]),
      );

      const itemsMap: Record<string, any> = {};
      for (const item of metadata) {
        const price = priceMap.get(item.itemId);
        itemsMap[String(item.itemId)] = {
          name: item.name ?? item.itemName,
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

      const timestamps = Object.values(itemsMap)
        .map((i: any) => (i.lastUpdate ? new Date(i.lastUpdate).getTime() : 0))
        .filter((t) => t > 0);
      result[providerKey] = {
        items: itemsMap,
        lastUpdate: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
      };
    }

    return result;
  }

  /**
   * Consolidated market grouped by category (coins / molten / silver),
   * mirroring the engine's former `consolidated-market`.
   */
  async getConsolidatedMarket(): Promise<Record<string, any>> {
    const providers = await this.pricingRedis.getProviders();
    const result: Record<string, any> = { coins: {}, molten: {}, silver: {} };
    const categoryMap: Record<number, string> = { 1: 'molten', 2: 'coins', 3: 'silver' };

    for (const providerKey of providers) {
      const metadata = await this.pricingRedis.getProviderItems(providerKey);
      const prices = await this.pricingRedis.getCurrent(providerKey);
      const priceMap = new Map<number, any>(prices.map((p) => [p.itemId, p]));

      for (const item of metadata) {
        const price = priceMap.get(item.itemId);
        const category = categoryMap[item.groupId];
        if (!category) continue;
        const cat = result[category];
        const name = item.name ?? item.itemName ?? `#${item.itemId}`;
        if (!cat[name]) cat[name] = {};
        cat[name][providerKey] = {
          name,
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
      }
    }

    for (const category of Object.keys(result)) {
      const items = result[category];
      const entries = Object.entries(items) as [string, Record<string, any>][];
      entries.sort((a, b) => {
        let aMaxBuy = 0;
        for (const p of Object.values(a[1])) if (p.buyPrice && p.buyPrice > aMaxBuy) aMaxBuy = p.buyPrice;
        let bMaxBuy = 0;
        for (const p of Object.values(b[1])) if (p.buyPrice && p.buyPrice > bMaxBuy) bMaxBuy = p.buyPrice;
        if (aMaxBuy !== bMaxBuy) return bMaxBuy - aMaxBuy;
        let aMinSell = Infinity;
        for (const p of Object.values(a[1])) if (p.sellPrice && p.sellPrice < aMinSell) aMinSell = p.sellPrice;
        let bMinSell = Infinity;
        for (const p of Object.values(b[1])) if (p.sellPrice && p.sellPrice < bMinSell) bMinSell = p.sellPrice;
        if (aMinSell !== bMinSell) return aMinSell - bMinSell;
        return a[0].localeCompare(b[0]);
      });
      result[category] = Object.fromEntries(entries);
    }

    return result;
  }
}
