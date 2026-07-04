import { Injectable, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { StructuredLogger } from '../../logger/structured-logger';
import { RedisService } from '../../redis/redis.service';
import { MITHQALS_PER_KILO, SUBTYPE_LABELS } from './price.types';
import type {
  ArbitrageOpportunity,
  ArbitrageQuery,
  ArbitrageRecord,
  ArbitrageSideDetail,
  ArbitrageSummary,
  PriceSubType,
  WalletState,
} from './price.types';

const ARBITRAGE_TTL = Number(process.env.ARBITRAGE_TTL) || 604800;
const ARBITRAGE_IDS_KEY = 'arbitrage:ids';

@Injectable()
export class ArbitragePersistenceService implements OnModuleInit {
  private readonly logger = new StructuredLogger(ArbitragePersistenceService.name);
  private readonly records: ArbitrageRecord[] = [];
  private idCounter = 0;

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  @OnEvent('telegram.arbitrage')
  handleArbitrage(opportunity: ArbitrageOpportunity): void {
    this.add(this.toRecord(opportunity));
  }

  query(filter: ArbitrageQuery = {}): ArbitrageRecord[] {
    return this.records.filter(
      (r) =>
        (!filter.subType || r.subType === filter.subType) &&
        (!filter.deliveryType || r.deliveryType === filter.deliveryType) &&
        (filter.from === undefined || r.date >= filter.from) &&
        (filter.to === undefined || r.date <= filter.to),
    );
  }

  summary(filter: ArbitrageQuery = {}): ArbitrageSummary {
    const matched = this.query(filter);
    const byCat = new Map<PriceSubType, { count: number; totalProfit: number }>();

    let totalProfit = 0;
    for (const r of matched) {
      totalProfit += r.totalProfit;
      const agg = byCat.get(r.subType) ?? { count: 0, totalProfit: 0 };
      agg.count += 1;
      agg.totalProfit += r.totalProfit;
      byCat.set(r.subType, agg);
    }

    return {
      count: matched.length,
      totalProfit,
      byCategory: [...byCat.entries()].map(([subType, agg]) => ({
        subType,
        label: SUBTYPE_LABELS[subType],
        count: agg.count,
        totalProfit: agg.totalProfit,
      })),
    };
  }

  wallet(): WalletState {
    let totalCashSpent = 0;
    let totalCashReceived = 0;
    let totalGoldBought = 0;
    let totalGoldSold = 0;

    for (const r of this.records) {
      const buyPrice = r.buy?.price ?? r.buyAt;
      const sellPrice = r.sell?.price ?? r.sellAt;
      const mithqals = MITHQALS_PER_KILO * r.quantity;
      totalCashSpent += Math.round(buyPrice * mithqals);
      totalCashReceived += Math.round(sellPrice * mithqals);
      totalGoldBought += r.quantity * 1000;
      totalGoldSold += r.quantity * 1000;
    }

    return {
      totalGoldBought,
      totalGoldSold,
      netGold: totalGoldBought - totalGoldSold,
      totalCashSpent,
      totalCashReceived,
      netCash: totalCashReceived - totalCashSpent,
    };
  }

  private toSideDetail(snapshot: ArbitrageOpportunity['buy']): ArbitrageSideDetail {
    return {
      price: snapshot.price,
      messageId: snapshot.messageId,
      date: snapshot.date,
      quantity: snapshot.quantity,
      sideLabel: snapshot.sideLabel,
      ourAction: snapshot.ourAction,
      description: snapshot.description,
      raw: snapshot.raw,
      chatId: snapshot.chatId,
      orderButtonData: snapshot.orderButton?.data,
      orderButtonText: snapshot.orderButton?.text,
    };
  }

  private toRecord(o: ArbitrageOpportunity): ArbitrageRecord {
    return {
      date: Math.max(o.buy.date, o.sell.date),
      subType: o.subType,
      deliveryType: o.deliveryType,
      buyAt: o.buy.price,
      sellAt: o.sell.price,
      spread: o.spread,
      quantity: o.quantity,
      totalProfit: o.totalProfit,
      buyFirst: o.buy.date <= o.sell.date,
      buy: this.toSideDetail(o.buy),
      sell: this.toSideDetail(o.sell),
    };
  }

  private add(record: ArbitrageRecord): void {
    this.records.push(record);
    this.persist(record).catch((error) => this.logger.error('Failed to persist arbitrage to Redis', error));
  }

  private async persist(record: ArbitrageRecord): Promise<void> {
    const client = this.redis.getClient();
    const id = ++this.idCounter;
    const key = `arbitrage:${id}`;
    await Promise.all([
      client.setex(key, ARBITRAGE_TTL, JSON.stringify(record)),
      client.zadd(ARBITRAGE_IDS_KEY, record.date, String(id)),
    ]);
  }

  private async load(): Promise<void> {
    try {
      const client = this.redis.getClient();
      const ids = await client.zrange(ARBITRAGE_IDS_KEY, 0, -1);
      if (ids.length === 0) return;

      this.idCounter = Math.max(0, ...ids.map(Number));
      const keys = ids.map((id) => `arbitrage:${id}`);
      const raw = await client.mget(...keys);
      for (const json of raw) {
        if (!json) continue;
        try {
          this.records.push(JSON.parse(json) as ArbitrageRecord);
        } catch {
          // skip corrupt entry
        }
      }
      this.logger.log(`Loaded ${this.records.length} stored arbitrages from Redis`);
    } catch (error) {
      this.logger.error('Failed to load stored arbitrages from Redis', error);
    }
  }
}
