import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AdminTelegramMonitoringService {
  private readonly logger = new Logger(AdminTelegramMonitoringService.name);

  constructor(private readonly redis: RedisService) {}

  async getMarketOverview(): Promise<Record<string, unknown>[]> {
    const raw = await this.redis.getClient().get('telegram:market:overview');
    return raw ? JSON.parse(raw) : [];
  }

  async getMarketState(deliveryType: string): Promise<Record<string, unknown> | null> {
    const raw = await this.redis.getClient().hget('telegram:market:states', deliveryType);
    return raw ? JSON.parse(raw) : null;
  }

  async getAllMarketStates(): Promise<Record<string, unknown>> {
    return this.redis.hgetall('telegram:market:states');
  }

  async getBestBuys(limit = 10): Promise<Record<string, unknown>[]> {
    const all = await this.getAllMarketStates();
    return (Object.values(all) as Record<string, unknown>[])
      .filter((m: any) => m.bestBid != null)
      .sort((a: any, b: any) => (a.bestBid ?? 0) - (b.bestBid ?? 0))
      .slice(0, limit);
  }

  async getBestSells(limit = 10): Promise<Record<string, unknown>[]> {
    const all = await this.getAllMarketStates();
    return (Object.values(all) as Record<string, unknown>[])
      .filter((m: any) => m.bestAsk != null)
      .sort((a: any, b: any) => (b.bestAsk ?? 0) - (a.bestAsk ?? 0))
      .slice(0, limit);
  }

  async getOpportunities(filter?: {
    type?: string;
    deliveryType?: string;
    from?: number;
    to?: number;
  }): Promise<Record<string, unknown>[]> {
    const client = this.redis.getClient();
    const ids = await client.zrevrange('telegram:opportunity:ids', 0, -1);
    if (ids.length === 0) return [];

    const keys = ids.map((id: string) => `telegram:opportunity:${id}`);
    const raw = await client.mget(...keys);
    const results: Record<string, unknown>[] = [];
    for (const json of raw) {
      if (!json) continue;
      try {
        const r = JSON.parse(json) as Record<string, unknown>;
        if (filter?.type && r.type !== filter.type) continue;
        if (filter?.deliveryType && r.deliveryType !== filter.deliveryType) continue;
        if (filter?.from != null && (r.date as number) < filter.from) continue;
        if (filter?.to != null && (r.date as number) > filter.to) continue;
        results.push(r);
      } catch {
        // skip
      }
    }
    return results;
  }

  async getOpportunitySummary(): Promise<Record<string, unknown>> {
    const all = await this.getOpportunities();
    const byType = new Map<string, number>();
    const byDeliveryType = new Map<string, number>();

    for (const r of all) {
      const t = (r.type as string) ?? 'UNKNOWN';
      byType.set(t, (byType.get(t) ?? 0) + 1);
      const dt = (r.deliveryType as string) ?? 'UNKNOWN';
      byDeliveryType.set(dt, (byDeliveryType.get(dt) ?? 0) + 1);
    }

    const typeLabels: Record<string, string> = {
      PRICE_MOVEMENT: 'تغییر قیمت',
      BEST_PRICE: 'بهترین قیمت',
    };

    return {
      count: all.length,
      byType: Array.from(byType.entries()).map(([type, count]) => ({ type, label: typeLabels[type] ?? type, count })),
      byDeliveryType: Array.from(byDeliveryType.entries()).map(([deliveryType, count]) => ({ deliveryType, count })),
    };
  }

  async getPrices(filter?: {
    subType?: string;
    deliveryType?: string;
    action?: string;
    from?: number;
    to?: number;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    const client = this.redis.getClient();
    const ids = await client.zrevrange('telegram:price:ids', 0, -1);
    if (ids.length === 0) return [];

    const keys = ids.map((id: string) => `telegram:price:${id}`);
    const raw = await client.mget(...keys);
    const results: Record<string, unknown>[] = [];
    for (const json of raw) {
      if (!json) continue;
      try {
        const p = JSON.parse(json) as Record<string, unknown>;
        if (filter?.subType && p.subType !== filter.subType) continue;
        if (filter?.deliveryType && p.deliveryType !== filter.deliveryType) continue;
        if (filter?.action && p.ourAction !== filter.action) continue;
        if (filter?.from != null && (p.date as number) < filter.from) continue;
        if (filter?.to != null && (p.date as number) > filter.to) continue;
        results.push(p);
      } catch {
        // skip
      }
    }

    if (filter?.limit && results.length > filter.limit) {
      return results.slice(0, filter.limit);
    }
    return results;
  }

  async getPriceFilters(): Promise<{ subTypes: { value: string; label: string }[]; deliveryTypes: string[] }> {
    const client = this.redis.getClient();
    const [rawSubTypes, rawDeliveryTypes] = await Promise.all([
      client.smembers('telegram:price:filters:subTypes'),
      client.smembers('telegram:price:filters:deliveryTypes'),
    ]);

    const subTypeLabels: Record<string, string> = {
      GOLD_COIN: 'سکه طلا',
      GOLD_BAR: 'طلای آب شده',
      GOLD_18K: 'طلای ۱۸ عیار',
      GOLD_24K: 'طلای ۲۴ عیار',
      CURRENCY: 'ارز',
      OTHER: 'سایر',
    };

    return {
      subTypes: rawSubTypes.map((v: string) => ({ value: v, label: subTypeLabels[v] ?? v })),
      deliveryTypes: rawDeliveryTypes,
    };
  }
}
