import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import * as amqp from 'amqplib';
import {
  RABBITMQ_EXCHANGE,
  RABBITMQ_EXCHANGE_TYPE,
  RABBITMQ_QUEUE,
  RABBITMQ_COMMAND_QUEUE,
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
  /** Backend -> engine provider-management command consumers (command queue). */
  private commandConsumers: Map<string, (msg: RabbitMQMessage) => void> = new Map();
  private commandConsumerTag: string | null = null;
  private commandConsuming = false;
  /** Ensures the "messaging unavailable" hint is logged once, not on every publish. */
  private unavailableHinted = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private shouldRetry = true;
  private readonly maxRetryDelay = 30000;
  private readonly initialRetryDelay = 1000;

  constructor(
    @Inject('RABBITMQ_CONNECTION') model: ChannelModel | null,
    private readonly configService: ConfigService,
  ) {
    this.model = model;
  }

  private buildUrl(): string {
    return (
      this.configService.get<string>('RABBITMQ_URL') ||
      `amqp://${this.configService.get<string>('RABBITMQ_USER', 'guest')}:${this.configService.get<string>('RABBITMQ_PASS', 'guest')}@${this.configService.get<string>('RABBITMQ_HOST', 'localhost')}:${this.configService.get<string>('RABBITMQ_PORT', '5672')}`
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.model) return;
    await this.setupChannel();
    this.registerModelHandlers(this.model);
  }

  private registerModelHandlers(model: ChannelModel): void {
    model.on('error', (err) => {
      this.logger.warn(`RabbitMQ connection issue: ${err.message}`);
    });

    model.on('close', () => {
      this.logger.warn('RabbitMQ connection closed; scheduling reconnection');
      this.channel = null;
      this.consumerTag = null;
      this.consuming = false;
      this.commandConsumerTag = null;
      this.commandConsuming = false;
      this.unavailableHinted = false;
      if (this.shouldRetry) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttempt++;
    const delay = Math.min(
      this.initialRetryDelay * Math.pow(2, this.reconnectAttempt - 1),
      this.maxRetryDelay,
    );
    this.logger.warn(`RabbitMQ reconnect attempt ${this.reconnectAttempt} in ${delay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnect().catch((err) => {
        this.logger.error(`Reconnect failed: ${err instanceof Error ? err.message : String(err)}`);
        this.scheduleReconnect();
      });
    }, delay);
  }

  private async reconnect(): Promise<void> {
    const url = this.buildUrl();
    this.logger.log(`Connecting to RabbitMQ at ${url.replace(/:\/\/.*@/, '://***@')}`);
    const model = await amqp.connect(url);
    this.model = model;
    this.registerModelHandlers(model);
    await this.setupChannel();
    if (this.consumers.size > 0) await this.startConsuming();
    if (this.commandConsumers.size > 0) await this.startCommandConsuming();
    this.reconnectAttempt = 0;
    this.logger.log('RabbitMQ reconnected');
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
        this.commandConsumerTag = null;
        this.commandConsuming = false;
      });

      await this.channel.assertExchange(RABBITMQ_EXCHANGE, RABBITMQ_EXCHANGE_TYPE, {
        durable: true,
      });
      await this.channel.assertQueue(RABBITMQ_QUEUE, { durable: true });
      await this.channel.assertQueue(RABBITMQ_COMMAND_QUEUE, { durable: true });
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

  /** Subscribe to a backend -> engine command on the dedicated command queue. */
  async subscribeCommand(
    pattern: MessagePattern,
    callback: (msg: RabbitMQMessage) => void,
  ): Promise<void> {
    this.commandConsumers.set(pattern, callback);
    if (this.channel) {
      await this.channel.bindQueue(
        RABBITMQ_COMMAND_QUEUE,
        RABBITMQ_EXCHANGE,
        getRoutingKey(pattern),
      );
    }
  }

  private async startCommandConsuming(): Promise<void> {
    if (!this.channel) return;

    if (this.commandConsumerTag) {
      try {
        await this.channel.cancel(this.commandConsumerTag);
      } catch {
        // ignore cancel errors during reconnect
      }
      this.commandConsumerTag = null;
    }

    for (const [pattern] of this.commandConsumers) {
      await this.channel.bindQueue(
        RABBITMQ_COMMAND_QUEUE,
        RABBITMQ_EXCHANGE,
        getRoutingKey(pattern as MessagePattern),
      );
    }

    const { consumerTag } = await this.channel.consume(
      RABBITMQ_COMMAND_QUEUE,
      (msg: ConsumeMessage | null) => {
        if (!msg) return;
        try {
          const parsed: RabbitMQMessage = JSON.parse(msg.content.toString());
          const callback = this.commandConsumers.get(parsed.pattern);
          if (callback) {
            callback(parsed);
          }
          this.channel?.ack(msg);
        } catch (error) {
          this.logger.error('Error processing command message', error);
          this.channel?.nack(msg, false, false);
        }
      },
      { noAck: false },
    );

    this.commandConsumerTag = consumerTag;
    this.commandConsuming = true;
    this.logger.log('RabbitMQ command consumer started');
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
    if (this.model && this.commandConsumers.size > 0) {
      await this.startCommandConsuming();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shouldRetry = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      if (this.consumerTag && this.channel) {
        await this.channel.cancel(this.consumerTag);
      }
      if (this.commandConsumerTag && this.channel) {
        await this.channel.cancel(this.commandConsumerTag);
      }
      if (this.channel) {
        await this.channel.close();
      }
      await this.model?.close();
    } catch {
      // ignore close errors
    }
  }
}
