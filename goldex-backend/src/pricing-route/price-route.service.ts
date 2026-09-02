import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { SymbolTypeEnum } from "../admin-symbol/enum/symbol.type.enum";
import { UnitTypeEnum } from "../admin-symbol/enum/unit.type.enum";
import { OrderSideEnum } from "../order/enum/order.side.enum";
import { RoutingModeEnum } from "./enum/routing-mode.enum";
import {
  PairRoutes,
  PriceRoute,
  RouteCandidate,
  RouteKind,
  RouteLeg,
  RouteRejection,
  RouteSide,
} from "./price-route.types";

/** How long the pair graph is reused before it is rebuilt from the database. */
const GRAPH_TTL_MS = 5_000;

interface GraphPair {
  pair: PricePairEntity;
  baseId: string;
  quoteId: string;
  baseSlug: string;
  quoteSlug: string;
}

interface RouteGraph {
  /** Every valid pair, keyed `${baseId}:${quoteId}`. */
  byEnds: Map<string, GraphPair>;
  /** Symbols reachable from a given symbol, in either direction. */
  neighbours: Map<string, Set<string>>;
  symbols: Map<string, SymbolEntity>;
}

/**
 * Resolves the price of a pair either directly or through a bridge symbol.
 *
 * The composition is a multiplication on the matching side. Writing `ask` for
 * the price the customer buys at (`bestBuyPrice`) and `bid` for the price they
 * sell at (`bestSellPrice`):
 *
 *   ask(A/C) = ask(A/B) × ask(B/C)      bid(A/C) = bid(A/B) × bid(B/C)
 *
 * and a leg held the other way round inverts and swaps sides:
 *
 *   ask(A/B) = 1 / bid(B/A)             bid(A/B) = 1 / ask(B/A)
 *
 * Units only cancel if the bridge is a pure scalar: XAU prices are per mesghal,
 * so XAU/USD × USD/IRR works (USD is a plain rate) while bridging through
 * another metal would not. That is enforced, not assumed.
 */
@Injectable()
export class PriceRouteService {
  private readonly logger = new Logger(PriceRouteService.name);

  private graphCache: { at: number; graph: RouteGraph } | null = null;

  constructor(
    @InjectRepository(PricePairEntity)
    private readonly pairRepo: Repository<PricePairEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
  ) {}

  /** Same window the market-status service uses to decide a price is stale. */
  private freshnessMs(): number {
    const parsed = parseInt(process.env.MARKET_PRICE_FRESHNESS_MS ?? "120000", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 120000;
  }

  /** Drop the cached graph — call after a pair is created, updated or removed. */
  invalidate(): void {
    this.graphCache = null;
  }

  async getGraph(): Promise<RouteGraph> {
    if (this.graphCache && Date.now() - this.graphCache.at < GRAPH_TTL_MS) {
      return this.graphCache.graph;
    }

    const [pairs, symbols] = await Promise.all([
      this.pairRepo.find({ relations: { baseSymbol: true, quoteSymbol: true } }),
      this.symbolRepo.find(),
    ]);

    const byEnds = new Map<string, GraphPair>();
    const neighbours = new Map<string, Set<string>>();

    for (const pair of pairs) {
      // Only a valid pair can carry a leg; an invalid one is not tradable in
      // either direction, so it must not silently become part of a bridge.
      if (!pair.isValid || !pair.baseSymbol || !pair.quoteSymbol) continue;

      const entry: GraphPair = {
        pair,
        baseId: pair.baseSymbol.id,
        quoteId: pair.quoteSymbol.id,
        baseSlug: pair.baseSymbol.slug,
        quoteSlug: pair.quoteSymbol.slug,
      };
      byEnds.set(`${entry.baseId}:${entry.quoteId}`, entry);

      for (const [from, to] of [
        [entry.baseId, entry.quoteId],
        [entry.quoteId, entry.baseId],
      ]) {
        const set = neighbours.get(from) ?? new Set<string>();
        set.add(to);
        neighbours.set(from, set);
      }
    }

    const graph: RouteGraph = {
      byEnds,
      neighbours,
      symbols: new Map(symbols.map((s) => [s.id, s])),
    };
    this.graphCache = { at: Date.now(), graph };
    return graph;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Both sides of one pair. */
  async resolvePair(pairId: string): Promise<PairRoutes> {
    const pair = await this.pairRepo.findOne({
      where: { id: pairId },
      relations: { baseSymbol: true, quoteSymbol: true, bridgeSymbol: true },
    });
    if (!pair) throw new NotFoundException(`Price pair ${pairId} not found`);

    const graph = await this.getGraph();
    return this.buildPairRoutes(graph, pair);
  }

  /** One side of one pair — the shape order pricing wants. */
  async resolveSide(pairId: string, side: RouteSide): Promise<PriceRoute> {
    const routes = await this.resolvePair(pairId);
    return side === OrderSideEnum.BUY ? routes.buy : routes.sell;
  }

  /** Every pair, resolved against one graph build. */
  async resolveAll(): Promise<PairRoutes[]> {
    const [graph, pairs] = await Promise.all([
      this.getGraph(),
      this.pairRepo.find({
        relations: { baseSymbol: true, quoteSymbol: true, bridgeSymbol: true },
      }),
    ]);
    return pairs.map((pair) => this.buildPairRoutes(graph, pair));
  }

  /**
   * Resolve many pairs against a single graph build, for callers that already
   * hold the pair rows (the market list, the socket cache refresh).
   */
  async resolveMany(pairs: PricePairEntity[]): Promise<Map<string, PairRoutes>> {
    const graph = await this.getGraph();
    return new Map(pairs.map((pair) => [pair.id, this.buildPairRoutes(graph, pair)]));
  }

  /**
   * The prices a caller should quote for a pair: the selected route per side.
   * Falls back to the pair's own stored bests when no route is usable, so a
   * caller that ignores routing behaves exactly as before.
   */
  effectivePrices(routes: PairRoutes, pair: PricePairEntity): {
    bestBuyPrice: number;
    bestSellPrice: number;
    buyKind: RouteKind | null;
    sellKind: RouteKind | null;
    bridgeSlug: string | null;
  } {
    const buy = routes.buy.selected;
    const sell = routes.sell.selected;
    return {
      bestBuyPrice: buy?.price ?? Number(pair.bestBuyPrice) ?? 0,
      bestSellPrice: sell?.price ?? Number(pair.bestSellPrice) ?? 0,
      buyKind: buy?.kind ?? null,
      sellKind: sell?.kind ?? null,
      bridgeSlug: buy?.bridgeSlug ?? sell?.bridgeSlug ?? null,
    };
  }

  // ── Building ─────────────────────────────────────────────────────────────

  private buildPairRoutes(graph: RouteGraph, pair: PricePairEntity): PairRoutes {
    const label = `${pair.baseSymbol?.slug ?? "?"}/${pair.quoteSymbol?.slug ?? "?"}`;
    const buy = this.buildRoute(graph, pair, OrderSideEnum.BUY, label);
    const sell = this.buildRoute(graph, pair, OrderSideEnum.SELL, label);

    return {
      pairId: pair.id,
      pairLabel: label,
      routingMode: pair.routingMode ?? RoutingModeEnum.AUTO,
      configuredBridgeSlug: pair.bridgeSymbol?.slug ?? null,
      bridgeMaxDeviationPercent:
        pair.bridgeMaxDeviationPercent == null ? null : Number(pair.bridgeMaxDeviationPercent),
      buy,
      sell,
      usesBridge:
        buy.selected?.kind === RouteKind.BRIDGE || sell.selected?.kind === RouteKind.BRIDGE,
      unpriceable: !buy.selected && !sell.selected,
    };
  }

  private buildRoute(
    graph: RouteGraph,
    pair: PricePairEntity,
    side: RouteSide,
    label: string,
  ): PriceRoute {
    const mode = pair.routingMode ?? RoutingModeEnum.AUTO;
    const baseId = pair.baseSymbol?.id;
    const quoteId = pair.quoteSymbol?.id;

    const direct =
      baseId && quoteId ? this.directCandidate(graph, pair, baseId, quoteId, side) : null;
    const bridges =
      baseId && quoteId ? this.bridgeCandidates(graph, pair, baseId, quoteId, side) : [];

    // Deviation is only meaningful against a usable direct price.
    const directPrice = direct?.usable ? direct.price : null;
    if (directPrice) {
      for (const candidate of bridges) {
        if (candidate.price == null) continue;
        candidate.deviationPercent = Number(
          (((candidate.price - directPrice) / directPrice) * 100).toFixed(4),
        );
      }
    }

    const limit =
      pair.bridgeMaxDeviationPercent == null ? null : Number(pair.bridgeMaxDeviationPercent);
    let deviationBlocked = false;
    if (limit != null && directPrice) {
      for (const candidate of bridges) {
        if (!candidate.usable || candidate.deviationPercent == null) continue;
        if (Math.abs(candidate.deviationPercent) > limit) {
          candidate.usable = false;
          candidate.rejection = RouteRejection.DEVIATION_EXCEEDED;
          candidate.note =
            `Bridged price differs from the direct price by ` +
            `${candidate.deviationPercent.toFixed(2)}%, over the pair's ${limit}% limit`;
          deviationBlocked = true;
        }
      }
    }

    const selected = this.select(mode, side, direct, bridges, pair.bridgeSymbolId ?? null);

    // Say why a route was passed over for a reason other than its prices.
    if (mode === RoutingModeEnum.DIRECT) {
      for (const candidate of bridges) {
        if (!candidate.usable) continue;
        candidate.usable = false;
        candidate.rejection = RouteRejection.MODE_EXCLUDED;
        candidate.note = "Routing mode is DIRECT — bridged routes are not used";
      }
    }
    if (mode === RoutingModeEnum.BRIDGE && direct?.usable) {
      direct.usable = false;
      direct.rejection = RouteRejection.MODE_EXCLUDED;
      direct.note = "Routing mode is BRIDGE — the direct route is not used";
    }

    return {
      pairId: pair.id,
      pairLabel: label,
      side,
      routingMode: mode,
      selected,
      direct,
      bridges,
      deviationBlocked,
    };
  }

  /**
   * AUTO  — direct when usable, otherwise the best usable bridge.
   * DIRECT— direct only.
   * BRIDGE— the configured bridge if usable, otherwise the best usable bridge.
   * BEST  — the best usable route of any kind.
   */
  private select(
    mode: RoutingModeEnum,
    side: RouteSide,
    direct: RouteCandidate | null,
    bridges: RouteCandidate[],
    configuredBridgeId: string | null,
  ): RouteCandidate | null {
    const usableBridges = bridges.filter((b) => b.usable && b.price != null);
    const configured = configuredBridgeId
      ? usableBridges.find((b) => b.bridgeSymbolId === configuredBridgeId)
      : undefined;

    switch (mode) {
      case RoutingModeEnum.DIRECT:
        return direct?.usable ? direct : null;

      case RoutingModeEnum.BRIDGE:
        return configured ?? this.best(side, usableBridges);

      case RoutingModeEnum.BEST: {
        const all = [...usableBridges];
        if (direct?.usable) all.push(direct);
        return this.best(side, all);
      }

      case RoutingModeEnum.AUTO:
      default:
        if (direct?.usable) return direct;
        return configured ?? this.best(side, usableBridges);
    }
  }

  /** Best for the customer: the lowest ask on a BUY, the highest bid on a SELL. */
  private best(side: RouteSide, candidates: RouteCandidate[]): RouteCandidate | null {
    let winner: RouteCandidate | null = null;
    for (const c of candidates) {
      if (c.price == null || c.price <= 0) continue;
      if (!winner) {
        winner = c;
        continue;
      }
      const better =
        side === OrderSideEnum.BUY ? c.price < winner.price! : c.price > winner.price!;
      if (better) winner = c;
    }
    return winner;
  }

  private directCandidate(
    graph: RouteGraph,
    pair: PricePairEntity,
    baseId: string,
    quoteId: string,
    side: RouteSide,
  ): RouteCandidate {
    const base: RouteCandidate = {
      kind: RouteKind.DIRECT,
      side,
      bridgeSlug: null,
      bridgeSymbolId: null,
      legs: [],
      price: null,
      usable: false,
      rejection: null,
      note: null,
      deviationPercent: null,
    };

    if (!pair.isValid) {
      return { ...base, rejection: RouteRejection.PAIR_INVALID, note: "The pair is not valid" };
    }

    const leg = this.legFor(
      { pair, baseId, quoteId, baseSlug: pair.baseSymbol.slug, quoteSlug: pair.quoteSymbol.slug },
      false,
      side,
    );
    if ("rejection" in leg) {
      return { ...base, rejection: leg.rejection, note: leg.note };
    }

    return { ...base, legs: [leg], price: leg.price, usable: true };
  }

  private bridgeCandidates(
    graph: RouteGraph,
    pair: PricePairEntity,
    baseId: string,
    quoteId: string,
    side: RouteSide,
  ): RouteCandidate[] {
    const fromBase = graph.neighbours.get(baseId);
    const fromQuote = graph.neighbours.get(quoteId);
    if (!fromBase || !fromQuote) return [];

    const candidates: RouteCandidate[] = [];

    for (const bridgeId of fromBase) {
      if (bridgeId === quoteId || bridgeId === baseId) continue;
      if (!fromQuote.has(bridgeId)) continue;

      const bridge = graph.symbols.get(bridgeId);
      const candidate: RouteCandidate = {
        kind: RouteKind.BRIDGE,
        side,
        bridgeSlug: bridge?.slug ?? null,
        bridgeSymbolId: bridgeId,
        legs: [],
        price: null,
        usable: false,
        rejection: null,
        note: null,
        deviationPercent: null,
      };

      if (!bridge || !this.isUnitSafeBridge(bridge)) {
        candidates.push({
          ...candidate,
          rejection: RouteRejection.BRIDGE_UNIT_UNSAFE,
          note:
            `"${bridge?.slug ?? bridgeId}" is not a plain currency, so the two legs' ` +
            `units do not cancel — bridging through it would give a wrong price`,
        });
        continue;
      }

      const first = this.resolveLeg(graph, baseId, bridgeId, side);
      const second = this.resolveLeg(graph, bridgeId, quoteId, side);

      if ("rejection" in first) {
        candidates.push({ ...candidate, rejection: first.rejection, note: `Leg 1: ${first.note}` });
        continue;
      }
      if ("rejection" in second) {
        candidates.push({
          ...candidate,
          legs: [first],
          rejection: second.rejection,
          note: `Leg 2: ${second.note}`,
        });
        continue;
      }

      candidates.push({
        ...candidate,
        legs: [first, second],
        price: Number((first.price * second.price).toFixed(8)),
        usable: true,
      });
    }

    if (candidates.length === 0) {
      return [
        {
          kind: RouteKind.BRIDGE,
          side,
          bridgeSlug: null,
          bridgeSymbolId: null,
          legs: [],
          price: null,
          usable: false,
          rejection: RouteRejection.NO_BRIDGE_FOUND,
          note: "No symbol is paired with both ends of this pair",
          deviationPercent: null,
        },
      ];
    }

    return candidates;
  }

  /**
   * A bridge has to be a pure scalar for the units to cancel: XAU is priced per
   * mesghal, so XAU/USD × USD/IRR is only valid because USD is a plain count.
   */
  private isUnitSafeBridge(symbol: SymbolEntity): boolean {
    return (
      symbol.unitType === UnitTypeEnum.NUMBER &&
      (symbol.symbolType === SymbolTypeEnum.FIAT || symbol.symbolType === SymbolTypeEnum.RIAL)
    );
  }

  /** Find a pair connecting `fromId -> toId`, in either stored orientation. */
  private resolveLeg(
    graph: RouteGraph,
    fromId: string,
    toId: string,
    side: RouteSide,
  ): RouteLeg | { rejection: RouteRejection; note: string } {
    const forward = graph.byEnds.get(`${fromId}:${toId}`);
    if (forward) return this.legFor(forward, false, side);

    const reverse = graph.byEnds.get(`${toId}:${fromId}`);
    if (reverse) return this.legFor(reverse, true, side);

    return {
      rejection: RouteRejection.NO_DIRECT_PAIR,
      note: `no pair connects ${this.slug(graph, fromId)} and ${this.slug(graph, toId)}`,
    };
  }

  /**
   * The price of one leg on one side, inverting when the stored pair points the
   * other way: ask(A/B) = 1 / bid(B/A) and bid(A/B) = 1 / ask(B/A).
   */
  private legFor(
    entry: GraphPair,
    inverted: boolean,
    side: RouteSide,
  ): RouteLeg | { rejection: RouteRejection; note: string } {
    const pair = entry.pair;
    const label = `${entry.baseSlug}/${entry.quoteSlug}`;

    if (!pair.isValid) {
      return { rejection: RouteRejection.PAIR_INVALID, note: `${label} is not valid` };
    }

    // On an inverted leg the sides swap before the reciprocal is taken.
    const wantAsk = side === OrderSideEnum.BUY;
    const useAsk = inverted ? !wantAsk : wantAsk;
    const raw = Number(useAsk ? pair.bestBuyPrice : pair.bestSellPrice);

    if (!Number.isFinite(raw) || raw <= 0) {
      return {
        rejection: RouteRejection.NO_PRICE,
        note: `${label} has no ${useAsk ? "buy" : "sell"} price`,
      };
    }

    const lastUpdated = pair.lastUpdated ? new Date(pair.lastUpdated) : null;
    const stale = !lastUpdated || Date.now() - lastUpdated.getTime() > this.freshnessMs();
    if (stale) {
      return {
        rejection: RouteRejection.STALE_PRICE,
        note: `${label} was last priced ${lastUpdated ? lastUpdated.toISOString() : "never"}`,
      };
    }

    return {
      pairId: pair.id,
      baseSlug: inverted ? entry.quoteSlug : entry.baseSlug,
      quoteSlug: inverted ? entry.baseSlug : entry.quoteSlug,
      inverted,
      price: inverted ? Number((1 / raw).toFixed(12)) : raw,
      provider: (useAsk ? pair.bestBuyProvider : pair.bestSellProvider) ?? null,
      lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
      stale: false,
    };
  }

  private slug(graph: RouteGraph, symbolId: string): string {
    return graph.symbols.get(symbolId)?.slug ?? symbolId;
  }
}
