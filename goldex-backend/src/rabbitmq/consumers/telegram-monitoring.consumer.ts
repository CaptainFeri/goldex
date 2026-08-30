import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq.service';
import { MessagePatterns, RabbitMQMessage } from '../interfaces/rabbitmq.interfaces';
import { RedisService } from '../../redis/redis.service';

const PRICE_TTL = 86400;
const OPPORTUNITY_TTL = 604800;

@Injectable()
export class TelegramMonitoringConsumer implements OnModuleInit {
  private readonly logger = new Logger(TelegramMonitoringConsumer.name);

  constructor(
    private readonly rmq: RabbitMQService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.rmq.subscribe(MessagePatterns.TELEGRAM_PRICE, (msg: RabbitMQMessage) => this.handlePrice(msg));
    await this.rmq.subscribe(MessagePatterns.TELEGRAM_OPPORTUNITY, (msg: RabbitMQMessage) => this.handleOpportunity(msg));
    await this.rmq.subscribe(MessagePatterns.TELEGRAM_MARKET_SNAPSHOT, (msg: RabbitMQMessage) => this.handleMarketSnapshot(msg));
    await this.rmq.startConsuming();
  }

  private async handlePrice(msg: RabbitMQMessage): Promise<void> {
    try {
      const point = msg.data as Record<string, unknown>;
      const messageId = point.messageId as number;
      if (!messageId) return;

      const key = `telegram:price:${messageId}`;
      await this.redis.getClient().setex(key, PRICE_TTL, JSON.stringify(point));
      await this.redis.getClient().zadd('telegram:price:ids', point.date as number, String(messageId));
      if (point.subType) await this.redis.getClient().sadd('telegram:price:filters:subTypes', point.subType as string);
      if (point.deliveryType) await this.redis.getClient().sadd('telegram:price:filters:deliveryTypes', point.deliveryType as string);
    } catch (err) {
      this.logger.error(`handlePrice failed: ${(err as Error).message}`);
    }
  }

  private async handleOpportunity(msg: RabbitMQMessage): Promise<void> {
    try {
      const opp = msg.data as Record<string, unknown>;
      const id = opp.messageId as number;
      if (!id) return;

      const key = `telegram:opportunity:${id}`;
      await this.redis.getClient().setex(key, OPPORTUNITY_TTL, JSON.stringify(opp));
      await this.redis.getClient().zadd('telegram:opportunity:ids', opp.date as number, String(id));
    } catch (err) {
      this.logger.error(`handleOpportunity failed: ${(err as Error).message}`);
    }
  }

  private async handleMarketSnapshot(msg: RabbitMQMessage): Promise<void> {
    try {
      const data = msg.data as { markets: Record<string, unknown>[] };
      if (!data?.markets) return;

      await this.redis.getClient().setex('telegram:market:overview', 3600, JSON.stringify(data.markets));

      const pipeline = this.redis.getClient().pipeline();
      pipeline.del('telegram:market:states');
      for (const m of data.markets) {
        const dt = m.deliveryType as string;
        if (dt) pipeline.hset('telegram:market:states', dt, JSON.stringify(m));
      }
      await pipeline.exec();
    } catch (err) {
      this.logger.error(`handleMarketSnapshot failed: ${(err as Error).message}`);
    }
  }
}
