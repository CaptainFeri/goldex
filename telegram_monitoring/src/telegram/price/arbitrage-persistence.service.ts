import { Injectable, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { StructuredLogger } from '../../logger/structured-logger';
import { SUBTYPE_LABELS } from './price.types';
import type {
  ArbitrageOpportunity,
  ArbitrageQuery,
  ArbitrageRecord,
  ArbitrageSummary,
  PriceSubType,
} from './price.types';

/**
 * Durably records every alerted arbitrage opportunity and answers
 * "how much would all arbitrages have profited" with date filters.
 *
 * Listens for `telegram.arbitrage` (emitted only for new, above-threshold
 * opportunities) so it captures exactly the trades that were signalled.
 */
@Injectable()
export class ArbitragePersistenceService implements OnModuleInit {
  private readonly logger = new StructuredLogger(
    ArbitragePersistenceService.name,
  );
  private readonly file =
    process.env.ARBITRAGE_DATA_FILE ??
    path.resolve('data', 'arbitrages.jsonl');
  private readonly records: ArbitrageRecord[] = [];
  private writeChain: Promise<void> = Promise.resolve();

  onModuleInit(): void {
    this.load();
  }

  @OnEvent('telegram.arbitrage')
  handleArbitrage(opportunity: ArbitrageOpportunity): void {
    this.add(this.toRecord(opportunity));
  }

  /** Records matching the filters, oldest first. */
  query(filter: ArbitrageQuery = {}): ArbitrageRecord[] {
    return this.records.filter(
      (r) =>
        (!filter.subType || r.subType === filter.subType) &&
        (!filter.deliveryType || r.deliveryType === filter.deliveryType) &&
        (filter.from === undefined || r.date >= filter.from) &&
        (filter.to === undefined || r.date <= filter.to),
    );
  }

  /** Total cash profit (and per-category breakdown) for the filtered range. */
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
    };
  }

  private add(record: ArbitrageRecord): void {
    this.records.push(record);
    const line = JSON.stringify(record) + '\n';
    this.writeChain = this.writeChain
      .then(() => fs.promises.appendFile(this.file, line, 'utf-8'))
      .catch((error) => this.logger.error('Failed to persist arbitrage', error));
  }

  private load(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (!fs.existsSync(this.file)) return;
      for (const line of fs.readFileSync(this.file, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          this.records.push(JSON.parse(line) as ArbitrageRecord);
        } catch {
          // skip a corrupt line
        }
      }
      this.logger.log(`Loaded ${this.records.length} stored arbitrages`);
    } catch (error) {
      this.logger.error('Failed to load stored arbitrages', error);
    }
  }
}
