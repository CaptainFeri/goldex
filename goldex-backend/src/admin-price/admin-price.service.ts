import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { TICKER_FRESHNESS_WINDOW_SECONDS } from "../admin-market/admin-market.service";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { PricePairHistoryEntity } from "../admin-pair/entity/price-pair-history.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import {
  MarketPoolType,
  MarketStatus,
  PairPoolStatusEntity,
} from "../market-status/entity/pair-pool-status.entity";
import { MarketStatusService } from "../market-status/market-status.service";
import { ProviderEntity } from "../provider/entity/provider.entity";
import { ProviderService } from "../provider/provider.service";
import { RIAL_SYMBOL_SLUG } from "../shared/constants/currency.constants";
import { MarketService } from "../websocket/market.service";
import {
  PriceEngineConfigDto,
  UpdateEngineConfigDto,
} from "./dto/engine-config.dto";
import {
  HISTORY_DEFAULT_HOURS,
  HISTORY_DEFAULT_POINTS,
  HISTORY_MAX_SYMBOLS,
  PriceHistoryDto,
  PriceHistoryMissingDto,
  PriceHistoryQueryDto,
  PriceHistorySeriesDto,
} from "./dto/price-history.dto";
import {
  PriceInstrumentDto,
  PriceInstrumentQueryDto,
  PriceInstrumentsDto,
  SetInstrumentMarketStatusDto,
} from "./dto/price-instrument.dto";
import { PriceEngineConfigEntity } from "./entity/price-engine-config.entity";
import { instrumentColor, isHexColor } from "./instrument-color";
import { bucketStarts, buildWindow, carryForward, parseSlugs } from "./history-buckets";

/** Instruments with no `category` set are grouped under this heading. */
export const UNCATEGORISED = "سایر";

/** One bucketed history row as Postgres hands it back. */
interface HistoryBucketRow {
  pairId: string;
  bucket: number;
  buyPrice: string | null;
  sellPrice: string | null;
}

@Injectable()
export class AdminPriceService {
  constructor(
    @InjectRepository(SymbolEntity) private readonly symbols: Repository<SymbolEntity>,
    @InjectRepository(PricePairEntity) private readonly pairs: Repository<PricePairEntity>,
    @InjectRepository(PricePairHistoryEntity)
    private readonly history: Repository<PricePairHistoryEntity>,
    @InjectRepository(PairPoolStatusEntity)
    private readonly poolStatus: Repository<PairPoolStatusEntity>,
    @InjectRepository(ProviderEntity) private readonly providers: Repository<ProviderEntity>,
    @InjectRepository(PriceEngineConfigEntity)
    private readonly config: Repository<PriceEngineConfigEntity>,
    private readonly market: MarketService,
    private readonly marketStatus: MarketStatusService,
    private readonly providerService: ProviderService,
  ) {}

  // ── Instruments ─────────────────────────────────────────────────────────

  /**
   * Every instrument the desk can price, grouped for the price screen.
   *
   * The catalogue is the `symbol` table — not the sixty entries in the panels'
   * `data/priceInstruments.js`. Migration 094 records why those must not be
   * seeded as symbols: `admin-user.service` creates a wallet per active symbol
   * for every user, and `credit.service` enumerates active material symbols, so
   * sixty display-only rows would mean sixty junk wallets per customer and
   * would leak into the credit machinery. An instrument here is a symbol that
   * genuinely exists; the rest need a real symbol, pair and provider mapping
   * first.
   *
   * The rial symbol itself is excluded — it is the unit everything else is
   * quoted in, and `IRR/IRR` is not a pair.
   */
  async instruments(query: PriceInstrumentQueryDto = {}): Promise<PriceInstrumentsDto> {
    const symbols = await this.symbols.find({
      order: { displayOrder: "ASC", name: "ASC" },
    });

    const search = query.search?.trim().toLowerCase();
    const wanted = symbols.filter((s) => {
      if (s.slug === RIAL_SYMBOL_SLUG) return false;
      if (query.category && (s.category ?? UNCATEGORISED) !== query.category) return false;
      if (!search) return true;
      return [s.name, s.slug, s.tickerKey].some((v) => (v ?? "").toLowerCase().includes(search));
    });

    const pairBySymbolId = await this.rialPairsByBaseId();
    const pairIds = wanted.map((s) => pairBySymbolId.get(s.id)?.id).filter(Boolean) as string[];

    const [prices, statusByPairId] = await Promise.all([
      wanted.length
        ? this.market.getMultiplePrices(wanted.map((s) => this.pairKey(s.slug)))
        : Promise.resolve({} as Record<string, any>),
      this.marketPoolStatus(pairIds),
    ]);

    const now = Date.now();
    const items = wanted.map((symbol) => {
      const pair = pairBySymbolId.get(symbol.id) ?? null;
      const point = prices[this.pairKey(symbol.slug)];
      const status = pair ? statusByPairId.get(pair.id) ?? null : null;
      return this.toInstrument(symbol, pair, point, status, now);
    });

    return {
      groups: this.group(items),
      total: items.length,
      quoteSlug: RIAL_SYMBOL_SLUG,
      generatedAt: new Date(now).toISOString(),
      freshnessWindowSeconds: TICKER_FRESHNESS_WINDOW_SECONDS,
    };
  }

  /**
   * Force one instrument's market open or closed, or hand it back to
   * derivation.
   *
   * Delegates to `MarketStatusService` rather than writing `pair_pool_status`
   * here: closing a pool cancels the orders resting in it, and that has to keep
   * happening whichever screen the operator closed it from.
   */
  async setMarketStatus(
    symbolId: string,
    dto: SetInstrumentMarketStatusDto,
  ): Promise<PriceInstrumentDto> {
    const symbol = await this.symbols.findOne({ where: { id: symbolId } });
    if (!symbol) throw new NotFoundException("PRICE.INSTRUMENT_NOT_FOUND");

    const pair = (await this.rialPairsByBaseId()).get(symbol.id);
    if (!pair) throw new BadRequestException("PRICE.INSTRUMENT_HAS_NO_PAIR");

    const target =
      dto.open === null || dto.open === undefined
        ? null
        : dto.open
          ? MarketStatus.OPEN
          : MarketStatus.CLOSED;
    await this.marketStatus.setOverrideForPair(pair.id, target);

    const prices = await this.market.getMultiplePrices([this.pairKey(symbol.slug)]);
    const status = (await this.marketPoolStatus([pair.id])).get(pair.id) ?? null;
    return this.toInstrument(symbol, pair, prices[this.pairKey(symbol.slug)], status, Date.now());
  }

  // ── History ─────────────────────────────────────────────────────────────

  /**
   * Recorded prices for a set of instruments, on one aligned time grid.
   *
   * Real rows from `price_pair_histories`, never a generated curve: the
   * reference screen synthesised its chart from a sine wave, and an operator
   * cannot tell a synthetic line from a real one once it is drawn.
   */
  async historyFor(query: PriceHistoryQueryDto): Promise<PriceHistoryDto> {
    const slugs = parseSlugs(query.symbols ?? "");
    if (slugs.length === 0) throw new BadRequestException("PRICE.NO_SYMBOLS_REQUESTED");
    if (slugs.length > HISTORY_MAX_SYMBOLS) {
      throw new BadRequestException("PRICE.TOO_MANY_SYMBOLS");
    }

    const points = query.points ?? HISTORY_DEFAULT_POINTS;
    const hours = query.hours ?? HISTORY_DEFAULT_HOURS;
    const window = buildWindow(Date.now(), hours, points);
    const from = new Date(window.fromMs);
    const to = new Date(window.toMs);

    const symbols = await this.symbols.find({ where: { slug: In(slugs) } });
    const bySlug = new Map(symbols.map((s) => [s.slug, s]));
    const pairBySymbolId = await this.rialPairsByBaseId();

    const series: PriceHistorySeriesDto[] = [];
    const missing: PriceHistoryMissingDto[] = [];
    const pairIdBySlug = new Map<string, string>();

    for (const slug of slugs) {
      const symbol = bySlug.get(slug);
      if (!symbol) {
        missing.push({ slug, reason: "unknown-symbol" });
        continue;
      }
      const pair = pairBySymbolId.get(symbol.id);
      if (!pair) {
        missing.push({ slug, reason: "no-pair" });
        continue;
      }
      pairIdBySlug.set(slug, pair.id);
      series.push({
        symbolId: symbol.id,
        slug: symbol.slug,
        name: symbol.name,
        color: instrumentColor(symbol.color, symbol.slug),
        buyKey: `${symbol.slug}_buy`,
        sellKey: `${symbol.slug}_sell`,
        filledPoints: 0,
      });
    }

    const pairIds = [...new Set(pairIdBySlug.values())];
    const [buckets, seeds] = await Promise.all([
      this.bucketedHistory(pairIds, from, to, window.widthMs / 1000, query.providerKey),
      this.historySeed(pairIds, from, query.providerKey),
    ]);

    const starts = bucketStarts(window);
    const rows: Array<Record<string, number | string | null>> = starts.map((at, i) => ({
      i,
      at: new Date(at).toISOString(),
    }));

    for (const s of series) {
      const pairId = pairIdBySlug.get(s.slug)!;
      const raw = buckets.get(pairId) ?? new Map<number, HistoryBucketRow>();

      const buys: Array<number | null> = new Array(window.points).fill(null);
      const sells: Array<number | null> = new Array(window.points).fill(null);
      for (const [bucket, row] of raw) {
        const idx = Math.min(Math.max(bucket, 0), window.points - 1);
        buys[idx] = this.num(row.buyPrice);
        sells[idx] = this.num(row.sellPrice);
      }

      const seed = seeds.get(pairId);
      const filledBuys = carryForward(buys, this.num(seed?.buyPrice));
      const filledSells = carryForward(sells, this.num(seed?.sellPrice));

      for (let i = 0; i < window.points; i++) {
        rows[i][s.buyKey] = filledBuys[i];
        rows[i][s.sellKey] = filledSells[i];
      }
      s.filledPoints = filledBuys.filter((v) => v !== null).length;
    }

    return {
      series,
      missing,
      rows,
      from: from.toISOString(),
      to: to.toISOString(),
      points: window.points,
      bucketSeconds: window.widthMs / 1000,
      quoteSlug: RIAL_SYMBOL_SLUG,
    };
  }

  // ── Engine config ───────────────────────────────────────────────────────

  async engineConfig(): Promise<PriceEngineConfigDto> {
    const [row, providers, autoSpread] = await Promise.all([
      this.configRow(),
      this.providers.find({ order: { category: "ASC", key: "ASC" } }),
      this.autoSpread(),
    ]);

    return {
      sources: providers.map((p) => ({
        id: p.id,
        key: p.key,
        label: p.persianName ?? null,
        category: p.category,
        active: p.active,
        status: p.status,
        lastStatusChangeAt: p.lastStatusChangeAt
          ? new Date(p.lastStatusChangeAt).toISOString()
          : null,
      })),
      autoSpread,
      refreshIntervalSec: row.refreshIntervalSec,
      updateAt: row.updateAt ? new Date(row.updateAt).toISOString() : null,
    };
  }

  async updateEngineConfig(dto: UpdateEngineConfigDto): Promise<PriceEngineConfigDto> {
    if (dto.autoSpread !== undefined) {
      const current = await this.autoSpread();
      // Echoing the value back is how a client PATCHes the whole object; asking
      // for a different one is asking for something this endpoint must not do.
      if (dto.autoSpread !== current.enabled) {
        throw new BadRequestException("PRICE.AUTO_SPREAD_NOT_WRITABLE");
      }
    }

    if (dto.sources?.length) {
      const keys = dto.sources.map((s) => s.key);
      if (new Set(keys).size !== keys.length) {
        throw new BadRequestException("PRICE.DUPLICATE_SOURCE_KEY");
      }
      const known = await this.providers.find({ where: { key: In(keys) } });
      const unknown = keys.filter((k) => !known.some((p) => p.key === k));
      // Validated before any of them is applied: half a config change is worse
      // than none, because nothing on the screen says which half landed.
      if (unknown.length) {
        throw new BadRequestException(`PRICE.UNKNOWN_SOURCE:${unknown.join(",")}`);
      }
      for (const source of dto.sources) {
        await this.providerService.setActiveByKey(source.key, source.active);
      }
    }

    if (dto.refreshIntervalSec !== undefined) {
      const row = await this.configRow();
      row.refreshIntervalSec = dto.refreshIntervalSec;
      await this.config.save(row);
    }

    return this.engineConfig();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private pairKey(slug: string): string {
    return `${slug}-${RIAL_SYMBOL_SLUG}`;
  }

  /** Every pair quoted in rial, keyed by its base symbol. */
  private async rialPairsByBaseId(): Promise<Map<string, PricePairEntity>> {
    const pairs = await this.pairs.find({
      where: { quoteSymbol: { slug: RIAL_SYMBOL_SLUG } },
      relations: { quoteSymbol: true },
    });
    return new Map(pairs.map((p) => [p.baseId, p]));
  }

  /**
   * The MARKET pool row for each pair.
   *
   * Read straight from `pair_pool_status` rather than through
   * `MarketStatusService.getAll()`, which rebuilds the bridge-route graph for
   * every pair on the install — this endpoint is polled every few seconds.
   * The rows are maintained by that service's 30-second sweep and by every
   * price update, so they lag by at most one sweep, and `persisted: false` in
   * the status screen is where a never-reconciled pair is properly explained.
   */
  private async marketPoolStatus(pairIds: string[]): Promise<Map<string, PairPoolStatusEntity>> {
    if (pairIds.length === 0) return new Map();
    const rows = await this.poolStatus.find({
      where: { pairId: In(pairIds), poolType: MarketPoolType.MARKET },
    });
    return new Map(rows.map((r) => [r.pairId, r]));
  }

  private toInstrument(
    symbol: SymbolEntity,
    pair: PricePairEntity | null,
    point: any,
    status: PairPoolStatusEntity | null,
    now: number,
  ): PriceInstrumentDto {
    const lastUpdated = point?.lastUpdated ?? null;
    return {
      id: symbol.id,
      slug: symbol.slug,
      tickerKey: symbol.tickerKey ?? null,
      name: symbol.name,
      category: symbol.category ?? null,
      color: instrumentColor(symbol.color, symbol.slug),
      colorConfigured: isHexColor(symbol.color),
      // The display prices, not the raw bests: they carry the pair's commission
      // and the symbol's gain, which is what a customer is actually quoted.
      buy: this.num(point?.displayBuyPrice),
      sell: this.num(point?.displaySellPrice),
      buyGram: this.num(point?.displayBuyGramPrice),
      sellGram: this.num(point?.displaySellGramPrice),
      quoteSlug: pair ? RIAL_SYMBOL_SLUG : null,
      pairId: pair?.id ?? null,
      marketOpen: status ? status.effectiveStatus === MarketStatus.OPEN : null,
      marketStatusReason: status?.reason ?? null,
      marketOverridden: !!status?.adminOverride,
      lastUpdated,
      stale: this.isStale(lastUpdated, now),
    };
  }

  /**
   * Categories in the order their first instrument appears.
   *
   * `display_order` already decides the sequence within a category; reusing it
   * for the group order too means the desk sets both from one field instead of
   * getting an alphabetical grouping it cannot influence.
   */
  private group(items: PriceInstrumentDto[]) {
    const groups = new Map<string, PriceInstrumentDto[]>();
    for (const item of items) {
      const key = item.category ?? UNCATEGORISED;
      const bucket = groups.get(key);
      if (bucket) bucket.push(item);
      else groups.set(key, [item]);
    }
    return [...groups.entries()].map(([category, list]) => ({ category, items: list }));
  }

  private async bucketedHistory(
    pairIds: string[],
    from: Date,
    to: Date,
    widthSeconds: number,
    providerKey?: string,
  ): Promise<Map<string, Map<number, HistoryBucketRow>>> {
    const out = new Map<string, Map<number, HistoryBucketRow>>();
    if (pairIds.length === 0) return out;

    const params: any[] = [pairIds, from, widthSeconds, to];
    const providerFilter = providerKey ? `AND h."provider_key" = $5` : "";
    if (providerKey) params.push(providerKey);

    // One row per pair per bucket, carrying that bucket's most recent report.
    // Aggregating in Postgres rather than streaming every row into Node: a busy
    // pair records thousands of prices a day and only `points` of them survive.
    const rows: HistoryBucketRow[] = await this.history.query(
      `SELECT h."pair_id" AS "pairId",
              floor(extract(epoch from (h."created_at" - $2::timestamptz)) / $3)::int AS "bucket",
              (array_agg(h."buy_price"  ORDER BY h."created_at" DESC))[1] AS "buyPrice",
              (array_agg(h."sell_price" ORDER BY h."created_at" DESC))[1] AS "sellPrice"
         FROM "price_pair_histories" h
        WHERE h."pair_id" = ANY($1::uuid[])
          AND h."created_at" >= $2::timestamptz
          AND h."created_at" <= $4::timestamptz
          ${providerFilter}
        GROUP BY h."pair_id", "bucket"`,
      params,
    );

    for (const row of rows) {
      const perPair = out.get(row.pairId) ?? new Map<number, HistoryBucketRow>();
      perPair.set(Number(row.bucket), row);
      out.set(row.pairId, perPair);
    }
    return out;
  }

  /**
   * The last price recorded before the window opened.
   *
   * Without it a quiet instrument opens its chart on empty space until it next
   * ticks, which reads as "no data" when the truth is "the price had not
   * moved".
   */
  private async historySeed(
    pairIds: string[],
    from: Date,
    providerKey?: string,
  ): Promise<Map<string, { buyPrice: string | null; sellPrice: string | null }>> {
    const out = new Map<string, { buyPrice: string | null; sellPrice: string | null }>();
    if (pairIds.length === 0) return out;

    const params: any[] = [pairIds, from];
    const providerFilter = providerKey ? `AND h."provider_key" = $3` : "";
    if (providerKey) params.push(providerKey);

    const rows: Array<{ pairId: string; buyPrice: string | null; sellPrice: string | null }> =
      await this.history.query(
        `SELECT DISTINCT ON (h."pair_id")
                h."pair_id" AS "pairId",
                h."buy_price"  AS "buyPrice",
                h."sell_price" AS "sellPrice"
           FROM "price_pair_histories" h
          WHERE h."pair_id" = ANY($1::uuid[])
            AND h."created_at" < $2::timestamptz
            ${providerFilter}
          ORDER BY h."pair_id", h."created_at" DESC`,
        params,
      );

    for (const row of rows) out.set(row.pairId, row);
    return out;
  }

  /**
   * Is an automatic spread in effect anywhere?
   *
   * Derived, never stored. The spread *is* the pair commission and the symbol
   * gain — the desk's margin on every quote — so the honest answer to "is auto
   * spread on" is whether any of those are configured, and the honest place to
   * change it is where it is configured.
   */
  private async autoSpread() {
    const [pairsWithCommission, symbolsWithGain] = await Promise.all([
      this.pairs
        .createQueryBuilder("p")
        .where("p.is_valid = true")
        .andWhere("(p.buy_commission <> 0 OR p.sell_commission <> 0)")
        .getCount(),
      this.symbols
        .createQueryBuilder("s")
        .where("s.gain IS NOT NULL")
        .andWhere("s.gain <> 0")
        .getCount(),
    ]);

    return {
      enabled: pairsWithCommission > 0 || symbolsWithGain > 0,
      pairsWithCommission,
      symbolsWithGain,
      writable: false,
    };
  }

  private async configRow(): Promise<PriceEngineConfigEntity> {
    const row = await this.config.findOne({ where: { singleton: true } });
    // The migration seeds this row; its absence means a broken install, and
    // inventing defaults here would hide that.
    if (!row) throw new NotFoundException("PRICE.ENGINE_CONFIG_ROW_MISSING");
    return row;
  }

  /** Zero is a real price only in the sense that it means "no quote". */
  private num(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private isStale(lastUpdated: string | null, now: number): boolean {
    if (!lastUpdated) return true;
    const at = Date.parse(lastUpdated);
    if (Number.isNaN(at)) return true;
    return now - at > TICKER_FRESHNESS_WINDOW_SECONDS * 1000;
  }
}
