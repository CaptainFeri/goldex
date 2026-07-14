import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { Cron, CronExpression } from "@nestjs/schedule";
import { RabbitMQService } from "../rabbitmq/rabbitmq.service";
import {
  MessagePatterns,
  RabbitMQMessage,
  PricePairUpdateMessage,
} from "../rabbitmq/interfaces/rabbitmq.interfaces";
import { MESQAL_TO_GRAM } from "../common/constants";

export interface PriceDataPoint {
  pair: string;
  pairId: string;
  bestBuyPrice: number;
  bestSellPrice: number;
  bestBuyProvider: string | null;
  bestSellProvider: string | null;
  buyCommission: number;
  sellCommission: number;
  baseGain: number;
  baseGainType: string;
  displayBuyPrice: number;
  displaySellPrice: number;
  bestBuyGramPrice: number;
  bestSellGramPrice: number;
  displayBuyGramPrice: number;
  displaySellGramPrice: number;
  minBuy: number;
  maxBuy: number;
  minSell: number;
  maxSell: number;
  decimals: number;
  lastUpdated: string;
  marketType: string;
}

@Injectable()
export class MarketService implements OnModuleInit {
  private readonly logger = new Logger(MarketService.name);
  private priceCache: Map<string, PriceDataPoint> = new Map();
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(
    @InjectRepository(PricePairEntity)
    private readonly pricePairRepo: Repository<PricePairEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    @InjectRepository(UserMarketTypeEntity)
    private readonly userMarketTypeRepo: Repository<UserMarketTypeEntity>,
    private readonly rmq: RabbitMQService,
  ) {}

  async onModuleInit() {
    this.logger.log("MarketService initializing...");
    await this.refreshPriceCache();

    await this.rmq.subscribe(
      MessagePatterns.PRICE_PAIR_UPDATE,
      (msg: RabbitMQMessage) => this.handlePairUpdate(msg),
    );

    this.logger.log("MarketService initialized, subscribed to PRICE_PAIR_UPDATE");
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async refreshPriceCache() {
    const pairs = await this.pricePairRepo.find({
      where: { isValid: true },
      relations: { baseSymbol: true, quoteSymbol: true },
    });

    if (pairs.length === 0) return;

    for (const pair of pairs) {
      const pairKey = `${pair.baseSymbol.slug}-${pair.quoteSymbol.slug}`;

      const buyCommission = parseFloat(pair.buyCommission as any) || 0;
      const sellCommission = parseFloat(pair.sellCommission as any) || 0;
      const baseGain = parseFloat(pair.baseSymbol.gain as any) || 0;
      const baseGainType = pair.baseSymbol.gainType || 'number';
      const bestBuyPrice = parseFloat(pair.bestBuyPrice as any) || 0;
      const bestSellPrice = parseFloat(pair.bestSellPrice as any) || 0;
      const bestBuyGramPrice = parseFloat(pair.bestBuyGramPrice as any) || 0;
      const bestSellGramPrice = parseFloat(pair.bestSellGramPrice as any) || 0;

      const gainAdjBuy = baseGainType === 'percent'
        ? bestBuyPrice * baseGain / 100
        : baseGain;
      const gainAdjSell = baseGainType === 'percent'
        ? bestSellPrice * baseGain / 100
        : baseGain;

      const displayBuyPrice = Math.max(0, bestBuyPrice * (1 + buyCommission / 100) + gainAdjBuy);
      const displaySellPrice = Math.max(0, bestSellPrice * (1 - sellCommission / 100) - gainAdjSell);

      const point: PriceDataPoint = {
        pair: pairKey,
        pairId: pair.id,
        bestBuyPrice,
        bestSellPrice,
        bestBuyProvider: pair.bestBuyProvider,
        bestSellProvider: pair.bestSellProvider,
        buyCommission,
        sellCommission,
        baseGain,
        baseGainType,
        displayBuyPrice,
        displaySellPrice,
        bestBuyGramPrice,
        bestSellGramPrice,
        displayBuyGramPrice: Math.max(0, bestBuyGramPrice * (1 + buyCommission / 100) + (baseGainType === 'percent' ? bestBuyGramPrice * baseGain / 100 : baseGain)),
        displaySellGramPrice: Math.max(0, bestSellGramPrice * (1 - sellCommission / 100) - (baseGainType === 'percent' ? bestSellGramPrice * baseGain / 100 : baseGain)),
        minBuy: parseFloat(pair.minBuy as any) || 0,
        maxBuy: parseFloat(pair.maxBuy as any) || 0,
        minSell: parseFloat(pair.minSell as any) || 0,
        maxSell: parseFloat(pair.maxSell as any) || 0,
        decimals: pair.decimals || 2,
        lastUpdated: (pair.lastUpdated || new Date()).toISOString(),
        marketType: pair.baseSymbol?.marketType,
      };

      const existing = this.priceCache.get(pairKey);
      if (!existing || existing.lastUpdated !== point.lastUpdated) {
        this.priceCache.set(pairKey, point);
        this.notifyListeners(pairKey, point);
      }
    }

    this.logger.log(`[CACHE] refreshed ${pairs.length} pairs`);
  }

  private async handlePairUpdate(msg: RabbitMQMessage): Promise<void> {
    try {
      const data = msg.data as PricePairUpdateMessage;
      if (!data || !data.pairKey) return;

      const point: PriceDataPoint = {
        pair: data.pairKey,
        pairId: data.pairId,
        bestBuyPrice: data.bestBuyPrice,
        bestSellPrice: data.bestSellPrice,
        bestBuyProvider: data.bestBuyProvider,
        bestSellProvider: data.bestSellProvider,
        buyCommission: data.buyCommission,
        sellCommission: data.sellCommission,
        baseGain: data.baseGain,
        baseGainType: data.baseGainType,
        displayBuyPrice: data.displayBuyPrice,
        displaySellPrice: data.displaySellPrice,
        bestBuyGramPrice: data.bestBuyGramPrice,
        bestSellGramPrice: data.bestSellGramPrice,
        displayBuyGramPrice: data.displayBuyGramPrice,
        displaySellGramPrice: data.displaySellGramPrice,
        minBuy: data.minBuy,
        maxBuy: data.maxBuy,
        minSell: data.minSell,
        maxSell: data.maxSell,
        decimals: data.decimals,
        lastUpdated: data.lastUpdated,
        marketType: data.marketType,
      };

      this.priceCache.set(data.pairKey, point);
      this.notifyListeners(data.pairKey, point);

      this.logger.log(
        `[REALTIME] ${data.pairKey} buy=${data.displayBuyPrice} sell=${data.displaySellPrice} (provider: ${data.bestBuyProvider || '-'}/${data.bestSellProvider || '-'})`,
      );
    } catch (err) {
      this.logger.error(`handlePairUpdate error: ${(err as Error).message}`);
    }
  }

  async getMultiplePrices(pairs: string[]): Promise<Record<string, any>> {
    const result: Record<string, any> = {};

    const wantsAll = pairs.includes("__all__");

    for (const pair of pairs) {
      if (wantsAll) {
        for (const [key, point] of this.priceCache.entries()) {
          result[key] = point;
        }
        break;
      }

      let point = this.priceCache.get(pair);

      if (!point) {
        const [base, quote] = pair.split("-");
        const reversePair = `${quote}-${base}`;
        point = this.priceCache.get(reversePair);

        if (point) {
          result[pair] = {
            ...point,
            pair,
            displayBuyPrice: 1 / point.displaySellPrice,
            displaySellPrice: 1 / point.displayBuyPrice,
          };
        }
        continue;
      }

      result[pair] = point;
    }

    return result;
  }

  getCachedPairKeys(): string[] {
    return Array.from(this.priceCache.keys());
  }

  async startStreaming(pairs: string[], callback: Function) {
    for (const pair of pairs) {
      if (!this.listeners.has(pair)) {
        this.listeners.set(pair, new Set());
      }
      this.listeners.get(pair)!.add(callback);

      const cached = this.priceCache.get(pair);
      if (cached) {
        callback(cached);
      }
    }
  }

  async stopStreaming(pairs: string[]) {
    for (const pair of pairs) {
      const listeners = this.listeners.get(pair);
      if (listeners) {
        listeners.clear();
        this.listeners.delete(pair);
      }
      this.logger.log(`Stopped streaming for ${pair}`);
    }
  }

  private notifyListeners(pair: string, data: PriceDataPoint) {
    const listeners = this.listeners.get(pair);
    if (listeners && listeners.size > 0) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (err) {
          this.logger.error(`Listener error for ${pair}: ${err}`);
        }
      });
    }
  }

  async getUserMarketTypes(userId: string): Promise<string[]> {
    const records = await this.userMarketTypeRepo.find({ where: { userId } });
    return records.map((r) => r.marketType);
  }

  async getMarketData(baseCode?: string, quoteCode?: string, limit: number = 50) {
    const query = this.pricePairRepo
      .createQueryBuilder("pair")
      .leftJoinAndSelect("pair.baseSymbol", "baseSymbol")
      .leftJoinAndSelect("pair.quoteSymbol", "quoteSymbol")
      .where("pair.isValid = :isValid", { isValid: true });

    if (baseCode) {
      query.andWhere("pair.baseCode = :baseCode", { baseCode });
    }

    if (quoteCode) {
      query.andWhere("pair.quoteCode = :quoteCode", { quoteCode });
    }

    const pairs = await query.orderBy("pair.lastUpdated", "DESC").limit(limit).getMany();

    return pairs.map((pair) => ({
      id: pair.id,
      pair: `${pair.baseSymbol.slug}-${pair.quoteSymbol.slug}`,
      bestBuyPrice: parseFloat(pair.bestBuyPrice as any) || 0,
      bestSellPrice: parseFloat(pair.bestSellPrice as any) || 0,
      buyCommission: parseFloat(pair.buyCommission as any) || 0,
      sellCommission: parseFloat(pair.sellCommission as any) || 0,
      marketType: pair.baseSymbol?.marketType,
    }));
  }
}
