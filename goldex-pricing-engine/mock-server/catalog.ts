import { config } from './config';

export type Group = 'molten' | 'coin' | 'silver';

export interface CatalogItem {
  id: number;
  name: string;
  group: Group;
  /** Persian group label, matched by the engine's metadata inference. */
  groupName: string;
  unit: string;
  /** Base mid price in toman. */
  base: number;
}

export interface Quote {
  item: CatalogItem;
  buy: number; // price the shop buys from you
  sell: number; // price the shop sells to you
  canBuy: boolean;
  canSell: boolean;
}

const GROUP_NAME: Record<Group, string> = {
  coin: 'مسکوکات',
  molten: 'آبشده',
  silver: 'نقره',
};

const UNIT: Record<Group, string> = {
  coin: 'عدد',
  molten: 'گرم',
  silver: 'گرم',
};

function item(id: number, name: string, group: Group, base: number): CatalogItem {
  return { id, name, group, groupName: GROUP_NAME[group], unit: UNIT[group], base };
}

// Silver ids 25 & 28 are special-cased by the TalaAb provider (no ×1000 scaling),
// so the silver catalog uses exactly those ids to stay faithful.
const BASE_CATALOG: CatalogItem[] = [
  item(101, 'سکه امامی', 'coin', 45_000_000),
  item(102, 'سکه بهار آزادی', 'coin', 43_000_000),
  item(103, 'نیم سکه', 'coin', 24_000_000),
  item(104, 'ربع سکه', 'coin', 15_000_000),
  item(105, 'سکه گرمی', 'coin', 9_000_000),
  item(201, 'آبشده نقدی', 'molten', 32_000_000),
  item(202, 'طلای ۱۸ عیار', 'molten', 7_000_000),
  item(25, 'نقره ۹۹۹', 'silver', 60_000),
  item(28, 'شمش نقره', 'silver', 58_000),
];

export function buildCatalog(): CatalogItem[] {
  const catalog = [...BASE_CATALOG];
  for (let i = 0; i < config.extraItems; i++) {
    catalog.push(item(1000 + i, `آیتم تستی ${i + 1}`, 'coin', 10_000_000 + i * 100_000));
  }
  return catalog;
}

/** Stable per-shop bias in [-0.01, +0.01] so shops disagree → arbitrage exists. */
function shopBias(shop: string): number {
  let hash = 0;
  for (let i = 0; i < shop.length; i++) hash = (hash * 31 + shop.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 2001) - 1000) / 100000;
}

function round1000(n: number): number {
  return Math.round(n / 1000) * 1000;
}

/**
 * Per-shop price state. Mids random-walk each tick but stay anchored near the
 * biased base so prices stay realistic over long runs.
 */
export class ShopState {
  readonly shop: string;
  readonly catalog: CatalogItem[];
  private mids = new Map<number, number>();
  private anchors = new Map<number, number>();

  constructor(shop: string) {
    this.shop = shop;
    this.catalog = buildCatalog();
    const bias = shopBias(shop);
    for (const it of this.catalog) {
      const anchor = it.base * (1 + bias);
      this.anchors.set(it.id, anchor);
      this.mids.set(it.id, round1000(anchor));
    }
  }

  tick(): void {
    for (const it of this.catalog) {
      const anchor = this.anchors.get(it.id)!;
      let mid = this.mids.get(it.id)!;
      mid *= 1 + (Math.random() * 2 - 1) * config.jitterPct;
      // Keep within ±5% of the anchor so it doesn't drift away over time.
      const lo = anchor * 0.95;
      const hi = anchor * 1.05;
      mid = Math.min(hi, Math.max(lo, mid));
      this.mids.set(it.id, round1000(mid));
    }
  }

  quotes(): Quote[] {
    const dealable = config.shopOpen;
    return this.catalog.map((it) => {
      const mid = this.mids.get(it.id)!;
      const sell = round1000(mid * (1 + config.halfSpreadPct));
      const buy = round1000(mid * (1 - config.halfSpreadPct));
      return { item: it, buy, sell, canBuy: dealable, canSell: dealable };
    });
  }
}
