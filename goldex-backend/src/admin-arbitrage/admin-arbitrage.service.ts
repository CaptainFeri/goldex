import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ArbitrageSignal, ArbitrageScanResult } from './arbitrage.types';

const OPPORTUNITIES_KEY = 'arbitrage:opportunities';
const ALERTS_KEY = 'arbitrage:alerts';
const SCAN_META_KEY = 'arbitrage:last-scan';

@Injectable()
export class AdminArbitrageService {
  constructor(private readonly redis: RedisService) {}

  async getOpportunities(): Promise<ArbitrageSignal[]> {
    const signals = (await this.redis.get(OPPORTUNITIES_KEY)) as ArbitrageSignal[] | null;
    if (!signals) return [];
    const now = Date.now();
    // Only surfaces opportunities whose quotes are still fresh.
    return signals
      .filter((s) => !s.deadline || new Date(s.deadline).getTime() > now)
      .sort((a, b) => (b.profitToman ?? 0) - (a.profitToman ?? 0));
  }

  async getAlerts(): Promise<ArbitrageSignal[]> {
    const alerts = (await this.redis.get(ALERTS_KEY)) as ArbitrageSignal[] | null;
    return alerts ?? [];
  }

  async getLastScan(): Promise<Partial<ArbitrageScanResult> | null> {
    return (await this.redis.get(SCAN_META_KEY)) ?? null;
  }
}
