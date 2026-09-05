import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq.service';
import { RedisService } from '../../redis/redis.service';
import {
  MessagePatterns,
  RabbitMQMessage,
  PriceSnapshotMessage,
} from '../interfaces/rabbitmq.interfaces';

@Injectable()
export class SnapshotConsumer implements OnModuleInit {
  private readonly logger = new Logger(SnapshotConsumer.name);

  constructor(
    private readonly rmq: RabbitMQService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.rmq.subscribe(
      MessagePatterns.PRICE_SNAPSHOT,
      (msg: RabbitMQMessage) => this.handleSnapshot(msg),
    );
  }

  private async handleSnapshot(msg: RabbitMQMessage): Promise<void> {
    try {
      const data = msg.data as PriceSnapshotMessage;

      if (!data.providerKey || !data.items?.length) {
        return;
      }

      await this.redis.setSnapshot(data.providerKey, data.items);

      this.logger.log(
        `Snapshot stored for ${data.providerKey}: ${data.items.length} items`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to handle snapshot: ${(err as Error).message}`,
      );
    }
  }
}
