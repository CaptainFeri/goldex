import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StructuredLogger } from '../../logger/structured-logger';
import { RedisService } from '../../redis/redis.service';
import { RabbitMQPublisherService } from '../rabbitmq-publisher.service';
import {
  MarketOpportunity,
  MarketOpportunityType,
  MarketState,
  OpportunityRecord,
  ParsedPrice,
  PriceSnapshot,
  PriceSubType,
} from './price.types';

const PRICE_MOVEMENT_THRESHOLD_PCT = 0.5;
const OPPORTUNITY_TTL = 604800;

@Injectable()
export class MarketMakerService implements OnModuleInit {
  private readonly logger = new StructuredLogger(MarketMakerService.name);

  private readonly markets = new Map<string, MarketState>();
  private readonly previousPrices = new Map<string, { price: number; ourAction: string }>();
  private readonly records: OpportunityRecord[] = [];
  private idCounter = 0;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly redis: RedisService,
    private readonly rmq: RabbitMQPublisherService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  onPrice(parsed: ParsedPrice, snapshot: PriceSnapshot): void {
    // Only track normal (عادی) opportunities — ignore معکوس and شنا.
    if (parsed.subType !== 'normal') return;

    const key = `${parsed.subType}::${parsed.deliveryType}`;
    this.updateMarketState(parsed, snapshot, key);
    this.detectPriceMovement(parsed, snapshot, key);
    this.detectBestPrice(parsed, snapshot, key);
  }

  getMarketOverview(): MarketState[] {
    return Array.from(this.markets.values());
  }

  getBestBuys(limit = 10): MarketState[] {
    return Array.from(this.markets.values())
      .filter((m) => m.bestBid !== null)
      .sort((a, b) => (a.bestBid ?? 0) - (b.bestBid ?? 0))
      .slice(0, limit);
  }

  getBestSells(limit = 10): MarketState[] {
    return Array.from(this.markets.values())
      .filter((m) => m.bestAsk !== null)
      .sort((a, b) => (b.bestAsk ?? 0) - (a.bestAsk ?? 0))
      .slice(0, limit);
  }

  getOpportunities(filter?: {
    type?: MarketOpportunityType;
    subType?: PriceSubType;
    deliveryType?: string;
    from?: number;
    to?: number;
  }): OpportunityRecord[] {
    let result = this.records;
    if (filter?.type) result = result.filter((r) => r.type === filter.type);
    if (filter?.subType) result = result.filter((r) => r.subType === filter.subType);
    if (filter?.deliveryType) result = result.filter((r) => r.deliveryType === filter.deliveryType);
    if (filter?.from) result = result.filter((r) => r.date >= filter.from!);
    if (filter?.to) result = result.filter((r) => r.date <= filter.to!);
    return result;
  }

  getSummary(filter?: { from?: number; to?: number }): {
    count: number;
    byType: { type: string; label: string; count: number }[];
    byDeliveryType: { deliveryType: string; count: number }[];
  } {
    let filtered = this.records;
    if (filter?.from) filtered = filtered.filter((r) => r.date >= filter.from!);
    if (filter?.to) filtered = filtered.filter((r) => r.date <= filter.to!);

    const typeCount = new Map<string, number>();
    const dtCount = new Map<string, number>();

    for (const r of filtered) {
      typeCount.set(r.type, (typeCount.get(r.type) ?? 0) + 1);
      dtCount.set(r.deliveryType, (dtCount.get(r.deliveryType) ?? 0) + 1);
    }

    const typeLabels: Record<string, string> = {
      PRICE_MOVEMENT: 'تغییر قیمت',
      BEST_PRICE: 'بهترین قیمت',
    };

    return {
      count: filtered.length,
      byType: Array.from(typeCount.entries()).map(([type, count]) => ({
        type,
        label: typeLabels[type] ?? type,
        count,
      })),
      byDeliveryType: Array.from(dtCount.entries()).map(([deliveryType, count]) => ({
        deliveryType,
        count,
      })),
    };
  }

  private updateMarketState(parsed: ParsedPrice, snapshot: PriceSnapshot, key: string): void {
    let state = this.markets.get(key);
    if (!state) {
      state = {
        subType: parsed.subType,
        deliveryType: parsed.deliveryType,
        bestBid: null,
        bestAsk: null,
        spread: null,
        lastPrice: parsed.price,
        lastAction: parsed.ourAction,
        priceChange: 0,
        priceChangePercent: 0,
        direction: 'FLAT',
        volume: 0,
        lastUpdate: snapshot.date,
      };
      this.markets.set(key, state);
    }

    const prev = this.previousPrices.get(key);
    const priceChange = prev ? parsed.price - prev.price : 0;
    const priceChangePercent = prev && prev.price
      ? Math.round((priceChange / prev.price) * 10000) / 100
      : 0;

    state.lastPrice = parsed.price;
    state.lastAction = parsed.ourAction;
    state.priceChange = priceChange;
    state.priceChangePercent = priceChangePercent;
    state.direction = priceChangePercent > 0 ? 'UP' : priceChangePercent < 0 ? 'DOWN' : 'FLAT';
    state.lastUpdate = snapshot.date;
    state.volume += parsed.quantity;

    const prevBestBid = state.bestBid;
    const prevBestAsk = state.bestAsk;

    if (parsed.ourAction === 'WE_BUY') {
      if (state.bestBid === null || parsed.price < state.bestBid) {
        state.bestBid = parsed.price;
      }
    } else {
      if (state.bestAsk === null || parsed.price > state.bestAsk) {
        state.bestAsk = parsed.price;
      }
    }

    state.prevBestBid = prevBestBid;
    state.prevBestAsk = prevBestAsk;

    if (state.bestBid !== null && state.bestAsk !== null) {
      state.spread = state.bestAsk - state.bestBid;
    }

    this.previousPrices.set(key, { price: parsed.price, ourAction: parsed.ourAction });

    this.rmq.publish('telegram.market.snapshot', {
      markets: Array.from(this.markets.values()),
    }).catch(() => {});
  }

  private detectPriceMovement(
    parsed: ParsedPrice,
    snapshot: PriceSnapshot,
    key: string,
  ): void {
    const state = this.markets.get(key);
    if (!state) return;

    const absChange = Math.abs(state.priceChangePercent);
    if (absChange < PRICE_MOVEMENT_THRESHOLD_PCT) return;

    const opportunity: MarketOpportunity = {
      type: 'PRICE_MOVEMENT',
      subType: parsed.subType,
      deliveryType: parsed.deliveryType,
      direction: state.direction,
      ourAction: parsed.ourAction,
      price: parsed.price,
      previousPrice: parsed.price - state.priceChange,
      changePercent: state.priceChangePercent,
      messageId: snapshot.messageId,
      date: snapshot.date,
      chatId: snapshot.chatId,
      quantity: parsed.quantity,
      description: parsed.description,
    };

    this.emitAndPersist(opportunity);
  }

  private detectBestPrice(
    parsed: ParsedPrice,
    snapshot: PriceSnapshot,
    key: string,
  ): void {
    const state = this.markets.get(key);
    if (!state) return;

    if (parsed.ourAction === 'WE_BUY' && state.bestBid === parsed.price) {
      const prevBest = state.prevBestBid ?? parsed.price;
      if (prevBest === parsed.price) return;

      const opportunity: MarketOpportunity = {
        type: 'BEST_PRICE',
        subType: parsed.subType,
        deliveryType: parsed.deliveryType,
        direction: 'DOWN',
        ourAction: 'WE_BUY',
        price: parsed.price,
        previousPrice: prevBest,
        changePercent: prevBest
          ? Math.round(((prevBest - parsed.price) / prevBest) * 10000) / 100
          : 0,
        messageId: snapshot.messageId,
        date: snapshot.date,
        chatId: snapshot.chatId,
        quantity: parsed.quantity,
        description: parsed.description,
      };
      this.emitAndPersist(opportunity);
    }

    if (parsed.ourAction === 'WE_SELL' && state.bestAsk === parsed.price) {
      const prevBest = state.prevBestAsk ?? parsed.price;
      if (prevBest === parsed.price) return;

      const opportunity: MarketOpportunity = {
        type: 'BEST_PRICE',
        subType: parsed.subType,
        deliveryType: parsed.deliveryType,
        direction: 'UP',
        ourAction: 'WE_SELL',
        price: parsed.price,
        previousPrice: prevBest,
        changePercent: prevBest
          ? Math.round(((parsed.price - prevBest) / prevBest) * 10000) / 100
          : 0,
        messageId: snapshot.messageId,
        date: snapshot.date,
        chatId: snapshot.chatId,
        quantity: parsed.quantity,
        description: parsed.description,
      };
      this.emitAndPersist(opportunity);
    }
  }

  private emitAndPersist(opportunity: MarketOpportunity): void {
    this.logger.logStructured('MARKET_OPPORTUNITY', {
      type: opportunity.type,
      subType: opportunity.subType,
      deliveryType: opportunity.deliveryType,
      direction: opportunity.direction,
      price: opportunity.price,
      changePercent: opportunity.changePercent,
    });

    const record: OpportunityRecord = {
      id: ++this.idCounter,
      date: opportunity.date,
      type: opportunity.type,
      subType: opportunity.subType,
      deliveryType: opportunity.deliveryType,
      direction: opportunity.direction,
      price: opportunity.price,
      previousPrice: opportunity.previousPrice,
      changePercent: opportunity.changePercent,
      messageId: opportunity.messageId,
      quantity: opportunity.quantity,
      description: opportunity.description,
    };

    this.records.push(record);
    this.persist(record).catch(() => {});
    this.eventEmitter.emit('market.opportunity', opportunity);
    this.rmq.publish('telegram.opportunity', opportunity).catch(() => {});
  }

  private async persist(record: OpportunityRecord): Promise<void> {
    const client = this.redis.getClient();
    const key = `opportunity:${record.id}`;
    await Promise.all([
      client.setex(key, OPPORTUNITY_TTL, JSON.stringify(record)),
      client.zadd('opportunity:ids', record.date, String(record.id)),
    ]);
  }

  private async load(): Promise<void> {
    try {
      const client = this.redis.getClient();
      const ids = await client.zrange('opportunity:ids', 0, -1);
      if (ids.length === 0) return;

      this.idCounter = Math.max(0, ...ids.map(Number));
      const keys = ids.map((id) => `opportunity:${id}`);
      const raw = await client.mget(...keys);
      for (const json of raw) {
        if (!json) continue;
        try {
          this.records.push(JSON.parse(json) as OpportunityRecord);
        } catch {
          // skip corrupt entry
        }
      }
      this.logger.log(`Loaded ${this.records.length} stored opportunities from Redis`);
    } catch (error) {
      this.logger.error('Failed to load stored opportunities from Redis', error);
    }
  }
}
