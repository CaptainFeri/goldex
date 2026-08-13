import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

const ALL_POOLS = [
  MarketPoolType.MARKET,
  MarketPoolType.LIMIT,
  MarketPoolType.QUOTE,
];

@Injectable()
export class MarketStatusService implements OnModuleInit {
  private readonly logger = new Logger(MarketStatusService.name);

  constructor(
    @InjectRepository(PairPoolStatusEntity)
    private readonly statusRepo: Repository<PairPoolStatusEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pairRepo: Repository<PricePairEntity>,
    private readonly rmq: RabbitMQService,
    private readonly closeService: MarketCloseService,
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

    for (const poolType of ALL_POOLS) {
      const derived = this.deriveStatus(pair, poolType);
      await this.reconcile(pairId, poolType, derived);
    }
  }

  /**
   * Derivation rule (per the decided scope):
   *  - MARKET: OPEN iff a mapped provider is currently reporting a fresh valid
   *    price (bestBuy or bestSell present and lastUpdated within the freshness
   *    window). Otherwise CLOSED.
   *  - LIMIT / QUOTE: always OPEN (admin may force them closed).
   */
  private deriveStatus(pair: PricePairEntity, poolType: MarketPoolType): MarketStatus {
    if (poolType !== MarketPoolType.MARKET) return MarketStatus.OPEN;

    const hasBestPrice =
      pair.bestBuyPrice != null ||
      pair.bestSellPrice != null;

    const freshnessMs = parseInt(process.env.MARKET_PRICE_FRESHNESS_MS ?? '120000', 10);
    const fresh =
      !!pair.lastUpdated &&
      Date.now() - new Date(pair.lastUpdated).getTime() <= freshnessMs;

    return hasBestPrice && fresh ? MarketStatus.OPEN : MarketStatus.CLOSED;
  }

  private async reconcile(
    pairId: string,
    poolType: MarketPoolType,
    derived: MarketStatus,
  ): Promise<void> {
    let row = await this.statusRepo.findOne({
      where: { pairId, poolType },
    });

    if (!row) {
      row = this.statusRepo.create({
        pairId,
        poolType,
        derivedStatus: derived,
        adminOverride: null,
        effectiveStatus: derived,
      });
      await this.statusRepo.save(row);
      return;
    }

    const prevEffective = row.effectiveStatus;
    row.derivedStatus = derived;
    row.effectiveStatus = row.adminOverride ?? derived;
    await this.statusRepo.save(row);

    // Only act on an OPEN -> CLOSED transition.
    if (prevEffective === MarketStatus.OPEN && row.effectiveStatus === MarketStatus.CLOSED) {
      this.logger.warn(`Market ${poolType} CLOSED for pair ${pairId} — closing pending orders`);
      await this.closeService.closePool(pairId, poolType);
    }
  }

  /** Set (or clear) the admin override for a pool on a pair. */
  async setOverride(
    pairId: string,
    poolType: MarketPoolType,
    status: MarketStatus | null,
  ): Promise<PairPoolStatusEntity> {
    const pair = await this.pairRepo.findOne({ where: { id: pairId } });
    if (!pair) throw new Error('Pair not found');

    let row = await this.statusRepo.findOne({ where: { pairId, poolType } });
    if (!row) {
      row = this.statusRepo.create({
        pairId,
        poolType,
        derivedStatus: this.deriveStatus(pair, poolType),
        adminOverride: null,
        effectiveStatus: this.deriveStatus(pair, poolType),
      });
    }

    const prevEffective = row.effectiveStatus;
    row.adminOverride = status;
    row.effectiveStatus = status ?? this.deriveStatus(pair, poolType);
    await this.statusRepo.save(row);

    if (prevEffective === MarketStatus.OPEN && row.effectiveStatus === MarketStatus.CLOSED) {
      this.logger.warn(`Admin closed ${poolType} for pair ${pairId} — closing pending orders`);
      await this.closeService.closePool(pairId, poolType);
    }

    return row;
  }

  async getForPair(pairId: string): Promise<PairPoolStatusEntity[]> {
    return this.statusRepo.find({ where: { pairId }, order: { poolType: 'ASC' } });
  }

  async getAll(): Promise<PairPoolStatusEntity[]> {
    return this.statusRepo.find({ order: { pairId: 'ASC', poolType: 'ASC' } });
  }

  /**
   * Periodic staleness sweep: when a provider stops reporting, no new price
   * message arrives, so we re-derive every pair's MARKET pool from lastUpdated
   * and close it if it has gone stale (transition handled in reconcile).
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  private async sweepStaleMarkets(): Promise<void> {
    const pairs = await this.pairRepo.find({ where: { isValid: true } });
    for (const pair of pairs) {
      await this.recomputeForPair(pair.id);
    }
  }
}
