import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { UnitTypeEnum } from "../admin-symbol/enum/unit.type.enum";
import { ValuationBasisEnum } from "./enum/valuation-basis.enum";

/** One hop of a conversion, in the direction it was actually travelled. */
export interface ValuationLeg {
  pairId: string;
  from: string;
  to: string;
  /** True when the stored pair reads to/from and its price was inverted. */
  inverted: boolean;
  /** `to` units per one `from` unit, after any inversion. */
  rate: number;
  lastUpdated: string | null;
  stale: boolean;
}

export interface ValuationRate {
  from: { id: string; slug: string };
  to: { id: string; slug: string };
  /** `to` units per one `from` unit, or null when no priced path exists. */
  rate: number | null;
  legs: ValuationLeg[];
  /** True when any leg's quote is older than the staleness window. */
  stale: boolean;
  /** Set when `rate` is null, saying why nothing could be priced. */
  reason?: string;
}

interface RateEdge {
  pairId: string;
  toSymbolId: string;
  rate: number;
  inverted: boolean;
  lastUpdated: Date | null;
}

/** Rebuilt at most this often; a scan of the pairs table is not free. */
const GRAPH_TTL_MS = 5_000;
/** A conversion longer than this is more noise than signal. */
const MAX_HOPS = 3;

/**
 * Values one asset in terms of another at live prices.
 *
 * The pairs table already carries each pair's best live quote, so conversion
 * is a walk over that graph: shortest path first, multiplying each leg. A pair
 * held the other way round is used inverted, which is why gold can be valued
 * in Rial even when only IRR/XAU exists.
 *
 * Gold is quoted per mesghal but held per gram, so a leg whose base symbol is
 * measured in grams uses the pair's gram columns. Getting that wrong would
 * overstate every gold holding by a factor of 4.33.
 */
@Injectable()
export class ValuationService {
  private readonly logger = new Logger(ValuationService.name);
  private graphCache: {
    at: number;
    basis: ValuationBasisEnum;
    edges: Map<string, RateEdge[]>;
    symbols: Map<string, SymbolEntity>;
  } | null = null;

  constructor(
    @InjectRepository(PricePairEntity)
    private readonly pairRepo: Repository<PricePairEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>
  ) {}

  /** Drops the cached graph, so the next lookup reads fresh quotes. */
  invalidate(): void {
    this.graphCache = null;
  }

  /**
   * Live rate from one symbol to another: how many `to` units one `from` unit
   * is worth right now.
   */
  async getRate(
    fromSymbolId: string,
    toSymbolId: string,
    basis: ValuationBasisEnum,
    stalenessSeconds: number
  ): Promise<ValuationRate> {
    const { edges, symbols } = await this.buildGraph(basis);

    const from = symbols.get(fromSymbolId);
    const to = symbols.get(toSymbolId);
    const identify = (id: string, s?: SymbolEntity) => ({ id, slug: s?.slug ?? s?.name ?? id });

    if (fromSymbolId === toSymbolId) {
      return {
        from: identify(fromSymbolId, from),
        to: identify(toSymbolId, to),
        rate: 1,
        legs: [],
        stale: false,
      };
    }

    const path = this.shortestPath(edges, fromSymbolId, toSymbolId);
    if (!path) {
      return {
        from: identify(fromSymbolId, from),
        to: identify(toSymbolId, to),
        rate: null,
        legs: [],
        stale: true,
        reason: "no-priced-route",
      };
    }

    const cutoff = Date.now() - stalenessSeconds * 1000;
    let rate = 1;
    let stale = false;
    const legs: ValuationLeg[] = [];
    let cursor = fromSymbolId;

    for (const edge of path) {
      const legStale = !edge.lastUpdated || edge.lastUpdated.getTime() < cutoff;
      stale = stale || legStale;
      rate *= edge.rate;
      legs.push({
        pairId: edge.pairId,
        from: symbols.get(cursor)?.slug ?? cursor,
        to: symbols.get(edge.toSymbolId)?.slug ?? edge.toSymbolId,
        inverted: edge.inverted,
        rate: edge.rate,
        lastUpdated: edge.lastUpdated ? edge.lastUpdated.toISOString() : null,
        stale: legStale,
      });
      cursor = edge.toSymbolId;
    }

    return {
      from: identify(fromSymbolId, from),
      to: identify(toSymbolId, to),
      rate,
      legs,
      stale,
    };
  }

  /** Rates from many symbols into one reference, computed off a single graph. */
  async getRates(
    fromSymbolIds: string[],
    toSymbolId: string,
    basis: ValuationBasisEnum,
    stalenessSeconds: number
  ): Promise<Map<string, ValuationRate>> {
    const out = new Map<string, ValuationRate>();
    for (const id of new Set(fromSymbolIds)) {
      out.set(id, await this.getRate(id, toSymbolId, basis, stalenessSeconds));
    }
    return out;
  }

  // ── Graph construction ───────────────────────────────────────────────────

  private async buildGraph(basis: ValuationBasisEnum) {
    const cached = this.graphCache;
    if (cached && cached.basis === basis && Date.now() - cached.at < GRAPH_TTL_MS) {
      return cached;
    }

    const [pairs, symbolRows] = await Promise.all([
      this.pairRepo.find({ relations: { baseSymbol: true, quoteSymbol: true } }),
      this.symbolRepo.find(),
    ]);

    const symbols = new Map(symbolRows.map((s) => [s.id, s]));
    const edges = new Map<string, RateEdge[]>();
    const push = (from: string, edge: RateEdge) => {
      const list = edges.get(from) ?? [];
      list.push(edge);
      edges.set(from, list);
    };

    for (const pair of pairs) {
      if (!pair.isValid) continue;
      if (!pair.baseSymbol || !pair.quoteSymbol) continue;

      const rate = this.legRate(pair, basis);
      if (rate === null || rate <= 0) continue;

      const lastUpdated = pair.lastUpdated ? new Date(pair.lastUpdated) : null;
      push(pair.baseId, {
        pairId: pair.id,
        toSymbolId: pair.quoteId,
        rate,
        inverted: false,
        lastUpdated,
      });
      push(pair.quoteId, {
        pairId: pair.id,
        toSymbolId: pair.baseId,
        rate: 1 / rate,
        inverted: true,
        lastUpdated,
      });
    }

    const graph = { at: Date.now(), basis, edges, symbols };
    this.graphCache = graph;
    return graph;
  }

  /**
   * Quote units per one base unit, in the unit the base asset is actually
   * held in. Gold pairs quote per mesghal while wallets count grams, so a
   * gram-denominated base reads the pair's gram columns.
   */
  private legRate(pair: PricePairEntity, basis: ValuationBasisEnum): number | null {
    const perGram = pair.baseSymbol?.unitType === UnitTypeEnum.GERAM;
    const ask = Number(perGram ? pair.bestBuyGramPrice : pair.bestBuyPrice) || 0;
    const bid = Number(perGram ? pair.bestSellGramPrice : pair.bestSellPrice) || 0;

    switch (basis) {
      case ValuationBasisEnum.ASK:
        return ask > 0 ? ask : bid > 0 ? bid : null;
      case ValuationBasisEnum.BID:
        return bid > 0 ? bid : ask > 0 ? ask : null;
      case ValuationBasisEnum.MID:
      default:
        if (ask > 0 && bid > 0) return (ask + bid) / 2;
        if (ask > 0) return ask;
        if (bid > 0) return bid;
        return null;
    }
  }

  /**
   * Fewest-hops path, breadth-first. Shortest wins rather than "best rate":
   * every extra leg adds another quote's staleness and spread to the answer.
   */
  private shortestPath(
    edges: Map<string, RateEdge[]>,
    from: string,
    to: string
  ): RateEdge[] | null {
    const queue: { node: string; path: RateEdge[] }[] = [{ node: from, path: [] }];
    const visited = new Set<string>([from]);

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      if (path.length >= MAX_HOPS) continue;

      for (const edge of edges.get(node) ?? []) {
        if (visited.has(edge.toSymbolId)) continue;
        const next = [...path, edge];
        if (edge.toSymbolId === to) return next;
        visited.add(edge.toSymbolId);
        queue.push({ node: edge.toSymbolId, path: next });
      }
    }
    return null;
  }
}
