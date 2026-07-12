import { Injectable, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';
import { StructuredLogger } from '../../logger/structured-logger';
import { RedisService } from '../../redis/redis.service';
import {
  PricePoint,
  PriceQuery,
  PriceSnapshot,
  SUBTYPE_LABELS,
  sideToAction,
} from './price.types';

const PRICE_TTL = Number(process.env.PRICE_TTL) || 86400;
const PRICE_IDS_KEY = 'price:ids';
const FILTER_SUBTYPES_KEY = 'price:filters:subTypes';
const FILTER_DELIVERY_KEY = 'price:filters:deliveryTypes';

@Injectable()
export class PricePersistenceService implements OnModuleInit {
  private readonly logger = new StructuredLogger(PricePersistenceService.name);
  private readonly points: PricePoint[] = [];
  private readonly added = new Subject<PricePoint>();

  get stream(): Observable<PricePoint> {
    return this.added.asObservable();
  }

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  @OnEvent('telegram.price')
  handlePrice(payload: { snapshot: PriceSnapshot }): void {
    this.add(this.toPoint(payload.snapshot));
  }

  query(filter: PriceQuery = {}): PricePoint[] {
    let result = this.points.filter(
      (p) =>
        (!filter.subType || p.subType === filter.subType) &&
        (!filter.deliveryType || p.deliveryType === filter.deliveryType) &&
        (!filter.action || p.ourAction === filter.action) &&
        (filter.from === undefined || p.date >= filter.from) &&
        (filter.to === undefined || p.date <= filter.to),
    );

    if (filter.limit && result.length > filter.limit) {
      result = result.slice(result.length - filter.limit);
    }
    return result;
  }

  filters(): {
    subTypes: { value: string; label: string }[];
    deliveryTypes: string[];
  } {
    const subTypes = new Set<string>();
    const deliveryTypes = new Set<string>();
    for (const p of this.points) {
      subTypes.add(p.subType);
      deliveryTypes.add(p.deliveryType);
    }
    return {
      subTypes: [...subTypes].map((value) => ({
        value,
        label: SUBTYPE_LABELS[value as keyof typeof SUBTYPE_LABELS] ?? value,
      })),
      deliveryTypes: [...deliveryTypes],
    };
  }

  private toPoint(snapshot: PriceSnapshot): PricePoint {
    return {
      date: snapshot.date,
      messageId: snapshot.messageId,
      price: snapshot.price,
      side: snapshot.sideLabel,
      ourAction: snapshot.ourAction,
      subType: snapshot.subType,
      deliveryType: snapshot.deliveryType,
      quantity: snapshot.quantity,
      description: snapshot.description,
    };
  }

  private add(point: PricePoint): void {
    this.points.push(point);
    this.added.next(point);
    this.persist(point).catch((error) =>
      this.logger.error('Failed to persist price to Redis', error),
    );
  }

  private async persist(point: PricePoint): Promise<void> {
    const client = this.redis.getClient();
    const key = `price:${point.messageId}`;
    await Promise.all([
      client.setex(key, PRICE_TTL, JSON.stringify(point)),
      client.zadd(PRICE_IDS_KEY, point.date, String(point.messageId)),
      client.sadd(FILTER_SUBTYPES_KEY, point.subType),
      client.sadd(FILTER_DELIVERY_KEY, point.deliveryType),
    ]);
  }

  private async load(): Promise<void> {
    try {
      const client = this.redis.getClient();
      const messageIds = await client.zrange(PRICE_IDS_KEY, 0, -1);
      if (messageIds.length === 0) return;

      const keys = messageIds.map((id) => `price:${id}`);
      const raw = await client.mget(...keys);
      for (const json of raw) {
        if (!json) continue;
        try {
          const point = JSON.parse(json) as PricePoint;
          if (!point.ourAction) point.ourAction = sideToAction(point.side);
          this.points.push(point);
        } catch {
          // skip corrupt entry
        }
      }
      this.logger.log(
        `Loaded ${this.points.length} stored price points from Redis`,
      );
    } catch (error) {
      this.logger.error('Failed to load stored prices from Redis', error);
    }
  }
}
