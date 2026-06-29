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
}
