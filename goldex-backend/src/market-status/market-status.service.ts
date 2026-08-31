import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { PricePairEntity } from '../admin-pair/entity/price.pair.entity';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { MessagePatterns, RabbitMQMessage } from '../rabbitmq/interfaces/rabbitmq.interfaces';
import {
  MarketPoolType,
  MarketStatus,
  PairPoolStatusEntity,
} from './entity/pair-pool-status.entity';
import { MarketCloseService } from './market-close.service';
import { MarketStatusReason, PairPoolStatusView, MarketStatusSummary } from './market-status.types';
import { PriceRouteService } from '../pricing-route/price-route.service';
import { PairRoutes, RouteKind } from '../pricing-route/price-route.types';

const ALL_POOLS = [
  MarketPoolType.MARKET,
  MarketPoolType.LIMIT,
  MarketPoolType.QUOTE,
];

interface DerivedStatus {
  status: MarketStatus;
  reason: MarketStatusReason;
  /** Set when the pair is quotable only through a bridge. */
  bridgeSlug?: string | null;
}

@Injectable()
export class MarketStatusService implements OnModuleInit {
  private readonly logger = new Logger(MarketStatusService.name);

  /**
   * Per-key promise chain that serializes mutations for the same pair/pool so
   * concurrent recomputes (price-update handler + periodic sweep) never race on
   * the find-then-insert of a `pair_pool_status` row (composite PK). The map is
   * keyed by a bounded set of pairs, so it never grows unbounded.
   */
  private readonly mutexes = new Map<string, Promise<unknown>>();

  private withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.mutexes.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.mutexes.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  constructor(
    @InjectRepository(PairPoolStatusEntity)
    private readonly statusRepo: Repository<PairPoolStatusEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pairRepo: Repository<PricePairEntity>,
    private readonly rmq: RabbitMQService,
    private readonly closeService: MarketCloseService,
    private readonly routeService: PriceRouteService,
  ) {}

  onModuleInit() {
    this.rmq.subscribe(MessagePatterns.PRICE_PAIR_UPDATE, (msg: RabbitMQMessage) =>
      this.handlePairUpdate(msg),
    );
  }

  private async handlePairUpdate(msg: RabbitMQMessage): Promise<void> {
    const pairId = msg.data?.pairId;
    if (!pairId) return;
    await this.recomputeForPair(pairId);
  }

  /**
   * Recompute derived status for every pool of a pair and apply transitions.
   * Called on every pair price update and by the periodic staleness sweep.
   */
  async recomputeForPair(pairId: string): Promise<void> {
    const pair = await this.pairRepo.findOne({ where: { id: pairId } });
    if (!pair) return;

    const routes = await this.safeRoutes(pairId);
    for (const poolType of ALL_POOLS) {
      const derived = this.deriveStatus(pair, poolType, routes);
      await this.reconcile(pairId, poolType, derived);
    }
  }

  /**
   * Route resolution must never take market status down with it — a resolver
   * failure falls back to direct-only derivation.
   */
  private async safeRoutes(pairId: string): Promise<PairRoutes | null> {
    try {
      return await this.routeService.resolvePair(pairId);
    } catch (err) {
      this.logger.warn(`route resolution failed for pair ${pairId}: ${(err as Error).message}`);
      return null;
    }
  }

  private freshnessMs(): number {
    const parsed = parseInt(process.env.MARKET_PRICE_FRESHNESS_MS ?? '120000', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 120000;
  }

  /**
   * Derivation rule (per the decided scope):
   *  - MARKET: OPEN iff a mapped provider is currently reporting a fresh valid
   *    price (bestBuy or bestSell present and lastUpdated within the freshness
   *    window). Otherwise CLOSED.
   *  - LIMIT / QUOTE: always OPEN (admin may force them closed).
   *
   * The reason travels with the status so the admin panel can say *why* a pool
   * is closed rather than only that it is.
   */
  private deriveStatus(
    pair: PricePairEntity,
    poolType: MarketPoolType,
    routes?: PairRoutes | null,
  ): DerivedStatus {
    if (poolType !== MarketPoolType.MARKET) {
      return { status: MarketStatus.OPEN, reason: MarketStatusReason.POOL_DEFAULT_OPEN };
    }

    const hasBestPrice = pair.bestBuyPrice != null || pair.bestSellPrice != null;
    const fresh =
      !!pair.lastUpdated &&
      Date.now() - new Date(pair.lastUpdated).getTime() <= this.freshnessMs();

    if (hasBestPrice && fresh) {
      return { status: MarketStatus.OPEN, reason: MarketStatusReason.PRICE_FRESH };
    }

    // The direct quote is unusable — but the pair is still tradable if a
    // bridged route is live (XAU/IRR from XAU/USD × USD/IRR). Closing it then
    // would deny trades the platform can actually price.
    const bridged =
      routes?.buy.selected?.kind === RouteKind.BRIDGE ||
      routes?.sell.selected?.kind === RouteKind.BRIDGE;
    if (bridged) {
      return {
        status: MarketStatus.OPEN,
        reason: MarketStatusReason.BRIDGE_PRICE,
        bridgeSlug: routes?.buy.selected?.bridgeSlug ?? routes?.sell.selected?.bridgeSlug ?? null,
      };
    }

    if (!hasBestPrice) {
      return { status: MarketStatus.CLOSED, reason: MarketStatusReason.NO_PRICE };
    }
    return { status: MarketStatus.CLOSED, reason: MarketStatusReason.STALE_PRICE };
  }

  private reconcile(
    pairId: string,
    poolType: MarketPoolType,
    derived: DerivedStatus,
  ): Promise<void> {
    return this.withMutex(`${pairId}:${poolType}`, async () => {
      let row = await this.statusRepo.findOne({
        where: { pairId, poolType },
      });

      if (!row) {
        row = this.statusRepo.create({
          pairId,
          poolType,
          derivedStatus: derived.status,
          adminOverride: null,
          effectiveStatus: derived.status,
          reason: derived.reason,
        });
        await this.statusRepo.save(row);
        return;
      }

      const prevEffective = row.effectiveStatus;
      row.derivedStatus = derived.status;
      row.effectiveStatus = row.adminOverride ?? derived.status;
      row.reason = row.adminOverride ? MarketStatusReason.ADMIN_OVERRIDE : derived.reason;
      await this.statusRepo.save(row);

      // Only act on an OPEN -> CLOSED transition.
      if (prevEffective === MarketStatus.OPEN && row.effectiveStatus === MarketStatus.CLOSED) {
        this.logger.warn(`Market ${poolType} CLOSED for pair ${pairId} — closing pending orders`);
        await this.closeService.closePool(pairId, poolType);
      }
    });
  }

  /** Set (or clear) the admin override for a pool on a pair. */
  setOverride(
    pairId: string,
    poolType: MarketPoolType,
    status: MarketStatus | null,
  ): Promise<PairPoolStatusEntity> {
    return this.withMutex(`${pairId}:${poolType}`, async () => {
      const pair = await this.pairRepo.findOne({ where: { id: pairId } });
      if (!pair) throw new NotFoundException('Pair not found');

      const derived = this.deriveStatus(pair, poolType, await this.safeRoutes(pairId));

      let row = await this.statusRepo.findOne({ where: { pairId, poolType } });
      if (!row) {
        row = this.statusRepo.create({
          pairId,
          poolType,
          derivedStatus: derived.status,
          adminOverride: null,
          effectiveStatus: derived.status,
          reason: derived.reason,
        });
      }

      const prevEffective = row.effectiveStatus;
      row.adminOverride = status;
      row.derivedStatus = derived.status;
      row.effectiveStatus = status ?? derived.status;
      row.reason = status ? MarketStatusReason.ADMIN_OVERRIDE : derived.reason;
      await this.statusRepo.save(row);

      if (prevEffective === MarketStatus.OPEN && row.effectiveStatus === MarketStatus.CLOSED) {
        this.logger.warn(`Admin closed ${poolType} for pair ${pairId} — closing pending orders`);
        await this.closeService.closePool(pairId, poolType);
      }

      return row;
    });
  }

  /**
   * Set (or clear) the same override on every pool of a pair, for the common
   * "close this pair entirely" action.
   */
  async setOverrideForPair(
    pairId: string,
    status: MarketStatus | null,
  ): Promise<PairPoolStatusEntity[]> {
    const rows: PairPoolStatusEntity[] = [];
    for (const poolType of ALL_POOLS) {
      rows.push(await this.setOverride(pairId, poolType, status));
    }
    return rows;
  }

  async getForPair(pairId: string): Promise<PairPoolStatusView[]> {
    const pair = await this.pairRepo.findOne({
      where: { id: pairId },
      relations: { baseSymbol: true, quoteSymbol: true },
    });
    if (!pair) throw new NotFoundException('Pair not found');

    const rows = await this.statusRepo.find({ where: { pairId } });
    const routes = await this.safeRoutes(pairId);
    return this.buildViews([pair], rows, routes ? new Map([[pairId, routes]]) : new Map());
  }

  /**
   * Every pair × every pool, always. Rows that have never been reconciled are
   * derived on the fly and marked `persisted: false` — previously they were
   * simply absent, and the panel silently dropped those pairs.
   */
  async getAll(): Promise<PairPoolStatusView[]> {
    const [pairs, rows] = await Promise.all([
      this.pairRepo.find({ relations: { baseSymbol: true, quoteSymbol: true } }),
      this.statusRepo.find(),
    ]);
    let routes = new Map<string, PairRoutes>();
    try {
      routes = await this.routeService.resolveMany(pairs);
    } catch (err) {
      this.logger.warn(`route resolution failed for the status matrix: ${(err as Error).message}`);
    }
    return this.buildViews(pairs, rows, routes);
  }

  async getSummary(): Promise<MarketStatusSummary> {
    const views = await this.getAll();

    const byPool = {} as MarketStatusSummary['byPool'];
    for (const pool of ALL_POOLS) {
      const inPool = views.filter((v) => v.poolType === pool);
      byPool[pool] = {
        open: inPool.filter((v) => v.effectiveStatus === MarketStatus.OPEN).length,
        closed: inPool.filter((v) => v.effectiveStatus === MarketStatus.CLOSED).length,
        overridden: inPool.filter((v) => v.adminOverride != null).length,
      };
    }

    const pairIds = [...new Set(views.map((v) => v.pairId))];
    const closedPairs = pairIds.filter((id) =>
      views
        .filter((v) => v.pairId === id)
        .every((v) => v.effectiveStatus === MarketStatus.CLOSED),
    );
    const stalePairs = views.filter(
      (v) => v.poolType === MarketPoolType.MARKET && v.reason === MarketStatusReason.STALE_PRICE,
    );
    const bridgedPairs = views.filter(
      (v) => v.poolType === MarketPoolType.MARKET && v.reason === MarketStatusReason.BRIDGE_PRICE,
    );

    return {
      totalPairs: pairIds.length,
      openPairs: pairIds.length - closedPairs.length,
      fullyClosedPairs: closedPairs.length,
      overriddenPools: views.filter((v) => v.adminOverride != null).length,
      stalePricePairs: stalePairs.length,
      bridgedPairs: bridgedPairs.length,
      byPool,
    };
  }

  private buildViews(
    pairs: PricePairEntity[],
    rows: PairPoolStatusEntity[],
    routes: Map<string, PairRoutes>,
  ): PairPoolStatusView[] {
    const byKey = new Map(rows.map((r) => [`${r.pairId}::${r.poolType}`, r]));
    const views: PairPoolStatusView[] = [];

    for (const pair of pairs) {
      const baseSlug = pair.baseSymbol?.slug ?? null;
      const quoteSlug = pair.quoteSymbol?.slug ?? null;

      for (const poolType of ALL_POOLS) {
        const row = byKey.get(`${pair.id}::${poolType}`);
        const derived = this.deriveStatus(pair, poolType, routes.get(pair.id) ?? null);

        views.push({
          pairId: pair.id,
          pairLabel: `${baseSlug ?? '?'}/${quoteSlug ?? '?'}`,
          baseSlug,
          quoteSlug,
          isValid: !!pair.isValid,
          lastPriceAt: pair.lastUpdated ? new Date(pair.lastUpdated).toISOString() : null,
          poolType,
          // Persisted rows can lag by up to one sweep; the freshly derived value
          // is what the pool would be right now.
          derivedStatus: derived.status,
          adminOverride: row?.adminOverride ?? null,
          effectiveStatus: row?.adminOverride ?? derived.status,
          reason: row?.adminOverride
            ? MarketStatusReason.ADMIN_OVERRIDE
            : derived.reason,
          bridgeSlug: derived.bridgeSlug ?? null,
          persisted: !!row,
          updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
        });
      }
    }

    return views.sort(
      (a, b) => a.pairLabel.localeCompare(b.pairLabel) || a.poolType.localeCompare(b.poolType),
    );
  }

  /**
   * Periodic staleness sweep: when a provider stops reporting, no new price
   * message arrives, so we re-derive every pair's MARKET pool from lastUpdated
   * and close it if it has gone stale (transition handled in reconcile). Sweeps
   * ALL pairs — including those with no provider mapping — so a pair that has no
   * relation with any provider is closed rather than left OPEN.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  private async sweepStaleMarkets(): Promise<void> {
    const pairs = await this.pairRepo.find();
    for (const pair of pairs) {
      await this.recomputeForPair(pair.id);
    }
  }
}
