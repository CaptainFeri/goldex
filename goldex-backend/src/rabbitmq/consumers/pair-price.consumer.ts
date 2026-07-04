import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RabbitMQService } from "../rabbitmq.service";
import { MessagePatterns, RabbitMQMessage, PriceData, PricePairUpdateMessage } from "../interfaces/rabbitmq.interfaces";
import { ProviderPairMappingService } from "../../provider-pair-mapping/provider-pair-mapping.service";
import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";
import { PricePairHistoryEntity } from "../../admin-pair/entity/price-pair-history.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { MESQAL_TO_GRAM } from "../../common/constants";

interface ProviderPrice {
  buyPrice: number;
  sellPrice: number;
}

@Injectable()
export class PairPriceConsumer implements OnModuleInit {
  private readonly logger = new Logger(PairPriceConsumer.name);
  private readonly latestPrices = new Map<string, Map<string, ProviderPrice>>();

  constructor(
    private readonly rmq: RabbitMQService,
    private readonly mappingService: ProviderPairMappingService,
    @InjectRepository(PricePairEntity)
    private readonly pairRepo: Repository<PricePairEntity>,
    @InjectRepository(PricePairHistoryEntity)
    private readonly historyRepo: Repository<PricePairHistoryEntity>
  ) {}

  async onModuleInit() {
    await this.rmq.subscribe(MessagePatterns.PRICE_UPDATE, (msg: RabbitMQMessage) => this.handlePriceUpdate(msg));
    await this.rmq.startConsuming();
  }

  private async handlePriceUpdate(msg: RabbitMQMessage): Promise<void> {
    try {
      const data = msg.data as PriceData;

      if (!data.providerKey || !data.itemId) {
        this.logger.warn(`PRICE_UPDATE ignored — missing providerKey or itemId`);
        return;
      }

      let mappings;
      try {
        mappings = await this.mappingService.findMappingsForPriceUpdate(data.providerKey, data.itemId);
      } catch {
        this.logger.warn(`No mappings for ${data.providerKey} item ${data.itemId}`);
        return;
      }

      if (mappings.length === 0) return;

      this.logger.log(
        `[PRICE] ${data.providerKey} item=${data.itemId} buy=${data.buyPrice} sell=${data.sellPrice} → ${mappings.length} mapping(s)`
      );

      const pairIds = new Set<string>();

      for (const mapping of mappings) {
        const pair = mapping.pair;
        if (!pair) continue;

        pairIds.add(pair.id);

        let pairPrices = this.latestPrices.get(pair.id);
        if (!pairPrices) {
          pairPrices = new Map();
          this.latestPrices.set(pair.id, pairPrices);
        }
        pairPrices.set(data.providerKey, {
          buyPrice: data.buyPrice,
          sellPrice: data.sellPrice,
        });

        try {
          await this.historyRepo.save({
            pairId: pair.id,
            providerKey: data.providerKey,
            providerItemId: data.itemId,
            buyPrice: data.buyPrice,
            sellPrice: data.sellPrice,
            buyGramPrice: data.buyPrice / MESQAL_TO_GRAM,
            sellGramPrice: data.sellPrice / MESQAL_TO_GRAM,
          });
            await this.trimHistory(pair.id);
        } catch (err) {
          this.logger.error(`History save failed for mapping ${mapping.id}: ${(err as Error).message}`);
        }
      }

      for (const pairId of pairIds) {
        const allPrices = this.latestPrices.get(pairId);
        if (allPrices) {
          for (const [prov, p] of allPrices.entries()) {
            this.logger.log(`[CACHE] pair=${pairId} provider=${prov} buy=${p.buyPrice} sell=${p.sellPrice}`);
          }
        }
        await this.recalculateBestPrices(pairId);
      }
    } catch (err) {
      this.logger.error(`handlePriceUpdate failed: ${(err as Error).message}`);
    }
  }

  private async trimHistory(pairId: string): Promise<void> {
    try {
      const count = await this.historyRepo.count({ where: { pairId } });
      if (count > 100) {
        const idsToKeep = await this.historyRepo.find({
          where: { pairId },
          order: { createdAt: "DESC" },
          take: 100,
        });
        const keepSet = new Set(idsToKeep.map((r) => r.id));
        await this.historyRepo
          .createQueryBuilder()
          .delete()
          .from(PricePairHistoryEntity)
          .where("pair_id = :pairId", { pairId })
          .andWhere("id NOT IN (:...ids)", { ids: [...keepSet] })
          .execute();
      }
    } catch (err) {
      this.logger.warn(`trimHistory failed for pair ${pairId}: ${(err as Error).message}`);
    }
  }

  private async recalculateBestPrices(pairId: string): Promise<void> {
    try {
      const mappings = await this.mappingService.findByPair(pairId);
      if (mappings.length === 0) return;

      const pairPrices = this.latestPrices.get(pairId);
      if (!pairPrices || pairPrices.size === 0) return;

      let bestBuyPrice = Number.MAX_VALUE;
      let bestBuyProvider: string | null = null;
      let bestSellPrice = Number.MIN_VALUE;
      let bestSellProvider: string | null = null;
      let hasValidPrice = false;

      for (const mapping of mappings) {
        const price = pairPrices.get(mapping.providerKey);
        if (!price) continue;

        if (mapping.useBuyPrice && price.buyPrice != null) {
          hasValidPrice = true;
          if (price.buyPrice < bestBuyPrice) {
            bestBuyPrice = price.buyPrice;
            bestBuyProvider = mapping.providerKey;
          }
        }

        if (mapping.useSellPrice && price.sellPrice != null) {
          hasValidPrice = true;
          if (price.sellPrice > bestSellPrice) {
            bestSellPrice = price.sellPrice;
            bestSellProvider = mapping.providerKey;
          }
        }
      }

      if (!hasValidPrice) return;

      const finalBestBuyPrice = bestBuyPrice < Number.MAX_VALUE ? bestBuyPrice : null;
      const finalBestSellPrice = bestSellPrice > Number.MIN_VALUE ? bestSellPrice : null;
      const finalBestBuyGramPrice = finalBestBuyPrice != null ? finalBestBuyPrice / MESQAL_TO_GRAM : null;
      const finalBestSellGramPrice = finalBestSellPrice != null ? finalBestSellPrice / MESQAL_TO_GRAM : null;

      await this.pairRepo.update(pairId, {
        price: finalBestBuyPrice,
        bestBuyPrice: finalBestBuyPrice,
        bestSellPrice: finalBestSellPrice,
        bestBuyGramPrice: finalBestBuyGramPrice,
        bestSellGramPrice: finalBestSellGramPrice,
        bestBuyProvider,
        bestSellProvider,
        lastUpdated: new Date(),
      });

      this.logger.log(
        `[BEST] pair=${pairId} buy=${bestBuyPrice} (${bestBuyProvider}) sell=${bestSellPrice} (${bestSellProvider})`
      );

      for (const mapping of mappings) {
        const price = pairPrices.get(mapping.providerKey);
        if (price) {
          this.logger.log(
            `[PROVIDER] ${mapping.providerKey} item=${mapping.providerItemId} buy=${price.buyPrice} sell=${price.sellPrice} useBuy=${mapping.useBuyPrice} useSell=${mapping.useSellPrice}`
          );
        }
      }

      await this.publishPairUpdate(pairId, bestBuyPrice, bestSellPrice, bestBuyProvider, bestSellProvider);
    } catch (err) {
      this.logger.error(`recalculateBestPrices failed for pair ${pairId}: ${(err as Error).message}`);
    }
  }

  private async publishPairUpdate(
    pairId: string,
    bestBuyPrice: number,
    bestSellPrice: number,
    bestBuyProvider: string | null,
    bestSellProvider: string | null
  ): Promise<void> {
    try {
      const pair = await this.pairRepo.findOne({
        where: { id: pairId },
        relations: { baseSymbol: true, quoteSymbol: true },
      });

      if (!pair || !pair.baseSymbol || !pair.quoteSymbol) return;

      const buyCommission = parseFloat(pair.buyCommission as any) || 0;
      const sellCommission = parseFloat(pair.sellCommission as any) || 0;
      const baseGain = parseFloat(pair.baseSymbol.gain as any) || 0;
      const baseGainType = pair.baseSymbol.gainType || "number";

      const buyGainAdjustment = baseGainType === "percent" ? (bestBuyPrice * baseGain) / 100 : baseGain;
      const sellGainAdjustment = baseGainType === "percent" ? (bestSellPrice * baseGain) / 100 : baseGain;

      const displayBuyPrice = bestBuyPrice * (1 + buyCommission / 100) + buyGainAdjustment;
      const displaySellPrice = bestSellPrice * (1 - sellCommission / 100) - sellGainAdjustment;

      const bestBuyGramPrice = bestBuyPrice / MESQAL_TO_GRAM;
      const bestSellGramPrice = bestSellPrice / MESQAL_TO_GRAM;
      const displayBuyGramPrice = displayBuyPrice / MESQAL_TO_GRAM;
      const displaySellGramPrice = displaySellPrice / MESQAL_TO_GRAM;

      const message: PricePairUpdateMessage = {
        pairId: pair.id,
        pairKey: `${pair.baseSymbol.slug}-${pair.quoteSymbol.slug}`,
        bestBuyPrice,
        bestSellPrice,
        bestBuyProvider,
        bestSellProvider,
        buyCommission,
        sellCommission,
        baseGain,
        baseGainType,
        displayBuyPrice: Math.max(0, displayBuyPrice),
        displaySellPrice: Math.max(0, displaySellPrice),
        bestBuyGramPrice,
        bestSellGramPrice,
        displayBuyGramPrice: Math.max(0, displayBuyGramPrice),
        displaySellGramPrice: Math.max(0, displaySellGramPrice),
        minBuy: parseFloat(pair.minBuy as any) || 0,
        maxBuy: parseFloat(pair.maxBuy as any) || 0,
        minSell: parseFloat(pair.minSell as any) || 0,
        maxSell: parseFloat(pair.maxSell as any) || 0,
        decimals: pair.decimals || 2,
        marketType: pair.marketType,
        lastUpdated: new Date().toISOString(),
      };

      this.rmq.publish(`price.pair.update.${pair.id}`, {
        pattern: MessagePatterns.PRICE_PAIR_UPDATE,
        data: message,
        timestamp: message.lastUpdated,
        providerKey: bestBuyProvider || bestSellProvider || undefined,
      });

      this.logger.log(
        `[PUBLISH] ${message.pairKey} displayBuy=${message.displayBuyPrice} displaySell=${message.displaySellPrice} comm=${buyCommission}/${sellCommission} gain=${baseGain}`
      );
      this.logger.log(
        `[DEBUG] ${message.pairKey} bestBuy=${bestBuyPrice} bestSell=${bestSellPrice} buyComm=${buyCommission}% sellComm=${sellCommission}% gain=${baseGain}(${baseGainType}) buyGainAdj=${buyGainAdjustment} sellGainAdj=${sellGainAdjustment}`
      );
    } catch (err) {
      this.logger.error(`publishPairUpdate failed: ${(err as Error).message}`);
    }
  }
}
