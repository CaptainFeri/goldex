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
    // Keep the latest scan's opportunities visible for the admin panel even if
    // an individual quote deadline has already passed; otherwise the page
    // collapses to 0 between scans.
    return signals.sort((a, b) => (b.profitToman ?? 0) - (a.profitToman ?? 0));
  }

  async getAlerts(): Promise<ArbitrageSignal[]> {
    const alerts = (await this.redis.get(ALERTS_KEY)) as ArbitrageSignal[] | null;
    return alerts ?? [];
  }

  async getLastScan(): Promise<Partial<ArbitrageScanResult> | null> {
    return (await this.redis.get(SCAN_META_KEY)) ?? null;
  }
}
