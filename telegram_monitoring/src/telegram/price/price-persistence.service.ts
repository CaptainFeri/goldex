import { Injectable, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { StructuredLogger } from '../../logger/structured-logger';
import {
  PricePoint,
  PriceQuery,
  PriceSnapshot,
  SUBTYPE_LABELS,
  sideToAction,
} from './price.types';

/**
 * Durably stores every parsed price as a JSON line and keeps an in-memory copy
 * for fast querying by the chart API. Listens for `telegram.price` events so
 * the telegram layer stays decoupled from storage.
 */
@Injectable()
export class PricePersistenceService implements OnModuleInit {
  private readonly logger = new StructuredLogger(PricePersistenceService.name);
  private readonly file =
    process.env.PRICE_DATA_FILE ?? path.resolve('data', 'prices.jsonl');
  private readonly points: PricePoint[] = [];
  /** Serializes appends so concurrent messages can't interleave a line. */
  private writeChain: Promise<void> = Promise.resolve();
  /** Emits every newly stored point for live (SSE) consumers. */
  private readonly added = new Subject<PricePoint>();

  /** Stream of points as they arrive, for real-time chart updates. */
  get stream(): Observable<PricePoint> {
    return this.added.asObservable();
  }

  onModuleInit(): void {
    this.load();
  }

  @OnEvent('telegram.price')
  handlePrice(payload: { snapshot: PriceSnapshot }): void {
    this.add(this.toPoint(payload.snapshot));
  }

  /** Returns points matching the filters, oldest first. */
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

  /** Distinct filter values present in the data, for the UI dropdowns. */
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
    const line = JSON.stringify(point) + '\n';
    this.writeChain = this.writeChain
      .then(() => fs.promises.appendFile(this.file, line, 'utf-8'))
      .catch((error) => this.logger.error('Failed to persist price', error));
  }

  private load(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (!fs.existsSync(this.file)) return;

      const lines = fs.readFileSync(this.file, 'utf-8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const point = JSON.parse(line) as PricePoint;
          // Older records predate `ourAction`; derive it from the raw side.
          if (!point.ourAction) point.ourAction = sideToAction(point.side);
          this.points.push(point);
        } catch {
          // skip a corrupt line rather than failing startup
        }
      }
      this.logger.log(`Loaded ${this.points.length} stored price points`);
    } catch (error) {
      this.logger.error('Failed to load stored prices', error);
    }
  }
}
