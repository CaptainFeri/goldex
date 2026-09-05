import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RabbitMQService } from "../rabbitmq/rabbitmq.service";
import { MessagePatterns, RabbitMQMessage } from "../rabbitmq/interfaces/rabbitmq.interfaces";
import { ProviderBalanceSnapshotEntity } from "./entity/provider-balance-snapshot.entity";

interface ProviderBalanceData {
  providerKey: string;
  goldBalance?: number;
  rialBalance?: number;
}

@Injectable()
export class ProviderBalanceConsumer implements OnModuleInit {
  private readonly logger = new Logger(ProviderBalanceConsumer.name);

  constructor(
    private readonly rmq: RabbitMQService,
    @InjectRepository(ProviderBalanceSnapshotEntity)
    private readonly snapshotRepo: Repository<ProviderBalanceSnapshotEntity>
  ) {}

  async onModuleInit() {
    await this.rmq.subscribe(MessagePatterns.PROVIDER_BALANCE_UPDATED, (msg: RabbitMQMessage) =>
      this.handleBalanceUpdate(msg)
    );
    await this.rmq.startConsuming();
  }

  private async handleBalanceUpdate(msg: RabbitMQMessage): Promise<void> {
    try {
      const data = msg.data as ProviderBalanceData;
      if (!data?.providerKey) return;

      // Upsert latest balance for the provider.
      await this.snapshotRepo.upsert(
        {
          providerKey: data.providerKey,
          goldBalance: data.goldBalance ?? null,
          rialBalance: data.rialBalance ?? null,
        },
        ["providerKey"]
      );
      this.logger.log(
        `Provider balance updated: ${data.providerKey} gold=${data.goldBalance} rial=${data.rialBalance}`
      );
    } catch (err) {
      this.logger.error(`handleBalanceUpdate failed: ${(err as Error).message}`);
    }
  }
}
