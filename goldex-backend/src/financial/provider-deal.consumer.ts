import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RabbitMQService } from "../rabbitmq/rabbitmq.service";
import { MessagePatterns, RabbitMQMessage } from "../rabbitmq/interfaces/rabbitmq.interfaces";
import { ProviderDealSnapshotEntity } from "./entity/provider-deal-snapshot.entity";

interface DoneDealsAggregate {
  dealCount: number;
  totalVolume: number;
  totalValue: number;
  buyVolume: number;
  sellVolume: number;
  buyValue?: number;
  sellValue?: number;
  netVolume: number;
  netValue?: number;
  lastDealAt: string | null;
}
interface ProviderDealsData {
  providerKey: string;
  doneDeals?: DoneDealsAggregate;
}

@Injectable()
export class ProviderDealConsumer implements OnModuleInit {
  private readonly logger = new Logger(ProviderDealConsumer.name);

  constructor(
    private readonly rmq: RabbitMQService,
    @InjectRepository(ProviderDealSnapshotEntity)
    private readonly snapshotRepo: Repository<ProviderDealSnapshotEntity>
  ) {}

  async onModuleInit() {
    await this.rmq.subscribe(MessagePatterns.PROVIDER_DEALS_UPDATED, (msg: RabbitMQMessage) =>
      this.handleDealsUpdate(msg)
    );
    await this.rmq.startConsuming();
  }

  private async handleDealsUpdate(msg: RabbitMQMessage): Promise<void> {
    try {
      const data = msg.data as ProviderDealsData;
      // Only the enriched (aggregate-bearing) messages update the snapshot.
      if (!data?.providerKey || !data.doneDeals) return;
      const a = data.doneDeals;

      await this.snapshotRepo.upsert(
        {
          providerKey: data.providerKey,
          dealCount: a.dealCount ?? 0,
          totalVolume: a.totalVolume ?? 0,
          totalValue: a.totalValue ?? 0,
          buyVolume: a.buyVolume ?? 0,
          sellVolume: a.sellVolume ?? 0,
          buyValue: a.buyValue ?? 0,
          sellValue: a.sellValue ?? 0,
          netVolume: a.netVolume ?? 0,
          netValue: a.netValue ?? 0,
          lastDealAt: a.lastDealAt ? new Date(a.lastDealAt) : null,
        },
        ["providerKey"]
      );
      this.logger.log(`Provider deals updated: ${data.providerKey} count=${a.dealCount} net=${a.netVolume}`);
    } catch (err) {
      this.logger.error(`handleDealsUpdate failed: ${(err as Error).message}`);
    }
  }
}
