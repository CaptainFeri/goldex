import {
  Injectable,
  Inject,
  OnModuleInit,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import {
  RABBITMQ_EXCHANGE,
  RABBITMQ_EXCHANGE_TYPE,
  RABBITMQ_QUEUE,
  MessagePattern,
  MessagePatterns,
  getRoutingKey,
} from './message-patterns.constant';

export interface RabbitMQMessage<T = unknown> {
  pattern: string;
  data: T;
  timestamp: string;
  providerKey?: string;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private channel: Channel | null = null;
  private model: ChannelModel | null = null;
  private consumers: Map<string, (msg: RabbitMQMessage) => void> = new Map();
  private consumerTag: string | null = null;
  private consuming = false;
  /** Ensures the "messaging unavailable" hint is logged once, not on every publish. */
  private unavailableHinted = false;

  constructor(@Inject('RABBITMQ_CONNECTION') model: ChannelModel | null) {
    this.model = model;
  }

  async onModuleInit(): Promise<void> {
    if (!this.model) return;
    await this.setupChannel();

    this.model.on('error', (err) => {
      this.logger.warn(`RabbitMQ connection issue: ${err.message}`);
    });

    this.model.on('close', () => {
      this.logger.warn('RabbitMQ connection closed; messaging paused');
      this.channel = null;
      this.consumerTag = null;
      this.consuming = false;
    });
  }

  private async setupChannel(): Promise<void> {
    if (!this.model) return;
    try {
      this.channel = await this.model.createChannel();

      this.channel.on('error', (err) => {
        this.logger.warn(`RabbitMQ channel issue: ${err.message}`);
      });

      this.channel.on('close', () => {
        this.logger.warn('RabbitMQ channel closed; messaging paused');
        this.channel = null;
        this.consumerTag = null;
        this.consuming = false;
      });

      await this.channel.assertExchange(RABBITMQ_EXCHANGE, RABBITMQ_EXCHANGE_TYPE, {
        durable: true,
      });
      await this.channel.assertQueue(RABBITMQ_QUEUE, { durable: true });
      this.unavailableHinted = false;
      this.logger.log('RabbitMQ channel initialized');
    } catch (error) {
      this.logger.warn(`RabbitMQ channel setup skipped: ${(error as Error).message}`);
    }
  }

  async publish<T>(pattern: MessagePattern, data: T, providerKey?: string): Promise<void> {
    if (!this.channel) {
      this.hintUnavailable();
      return;
    }

    const message: RabbitMQMessage<T> = {
      pattern,
      data,
      timestamp: new Date().toISOString(),
      providerKey,
    };

    const routingKey = getRoutingKey(pattern, providerKey);
    const buffer = Buffer.from(JSON.stringify(message));

    try {
      this.channel.publish(RABBITMQ_EXCHANGE, routingKey, buffer, {
        persistent: true,
        contentType: 'application/json',
      });
    } catch (error) {
      // The channel may have closed between the null-check and here (e.g. broker
      // shutdown). Degrade quietly: drop the channel and hint once — don't throw.
      this.channel = null;
      this.hintUnavailable((error as Error).message);
    }
  }

  /** Logs a single, stack-free hint while messaging is unavailable. */
  private hintUnavailable(reason?: string): void {
    if (this.unavailableHinted) return;
    this.unavailableHinted = true;
    const suffix = reason ? ` (${reason})` : '';
    this.logger.warn(`RabbitMQ unavailable${suffix}; skipping publishes until reconnected`);
  }

  async subscribe(
    pattern: MessagePattern,
    callback: (msg: RabbitMQMessage) => void,
  ): Promise<void> {
    this.consumers.set(pattern, callback);

    if (this.channel) {
      const routingKey = getRoutingKey(pattern);
      await this.channel.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, routingKey);
    }
  }

  async startConsuming(): Promise<void> {
    if (!this.channel) return;

    if (this.consumerTag) {
      try {
        await this.channel.cancel(this.consumerTag);
      } catch {
        // ignore cancel errors during reconnect
      }
      this.consumerTag = null;
    }

    for (const [pattern] of this.consumers) {
      const routingKey = getRoutingKey(pattern as MessagePattern);
      await this.channel.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, routingKey);
    }

    const { consumerTag } = await this.channel.consume(
      RABBITMQ_QUEUE,
      (msg: ConsumeMessage | null) => {
        if (!msg) return;
        try {
          const content = msg.content.toString();
          const parsed: RabbitMQMessage = JSON.parse(content);

          const callback = this.consumers.get(parsed.pattern);
          if (callback) {
            callback(parsed);
          }

          this.channel?.ack(msg);
        } catch (error) {
          this.logger.error('Error processing RabbitMQ message', error);
          this.channel?.nack(msg, false, false);
        }
      },
      { noAck: false },
    );

    this.consumerTag = consumerTag;
    this.consuming = true;
    this.logger.log('RabbitMQ consumer started');
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.model && this.consumers.size > 0) {
      await this.startConsuming();
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.consumerTag && this.channel) {
        await this.channel.cancel(this.consumerTag);
      }
      if (this.channel) {
        await this.channel.close();
      }
    } catch {
      // ignore close errors
    }
  }
}
