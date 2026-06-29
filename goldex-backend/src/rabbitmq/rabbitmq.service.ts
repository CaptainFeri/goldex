import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService, ConfigType } from '@nestjs/config';
import * as amqp from 'amqplib';
import appEnvConfig from '../config/app.env.config';
import {
  RabbitMQMessage,
} from './interfaces/rabbitmq.interfaces';

@Injectable()
export class RabbitMQService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private exchange: string;
  private queue: string;
  private subscribers: Map<string, (msg: RabbitMQMessage) => void> = new Map();
  private consuming = false;
  private connecting = false;
  private consumerTag: string | null = null;
  private shouldRetry = true;
  private retryAttempt = 0;
  private readonly maxRetryDelay = 30000;
  private readonly initialRetryDelay = 1000;
  private rmqConfig: {
    host: string;
    port: number;
    user: string;
    pass: string;
  };

  constructor(
    config: ConfigService<ConfigType<typeof appEnvConfig>>,
  ) {
    const rmqConfig = config.get('rabbitmq', { infer: true });
    this.exchange = rmqConfig.exchange;
    this.queue = rmqConfig.queue;
    this.rmqConfig = rmqConfig;

    this.connectWithRetry(rmqConfig);
  }

  private async connectWithRetry(rmqConfig: {
    host: string;
    port: number;
    user: string;
    pass: string;
  }): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;

    while (this.shouldRetry) {
      try {
        await this.connect(rmqConfig);
        this.retryAttempt = 0;
        this.connecting = false;
        return;
      } catch (err) {
        this.retryAttempt++;
        const delay = Math.min(
          this.initialRetryDelay * Math.pow(2, this.retryAttempt - 1),
          this.maxRetryDelay,
        );
        this.logger.warn(
          `RabbitMQ connection attempt ${this.retryAttempt} failed, retrying in ${delay}ms...`,
        );
        await this.sleep(delay);
      }
    }

    this.connecting = false;
  }

  private async connect(rmqConfig: {
    host: string;
    port: number;
    user: string;
    pass: string;
  }): Promise<void> {
    const url = `amqp://${rmqConfig.user}:${rmqConfig.pass}@${rmqConfig.host}:${rmqConfig.port}`;
    this.connection = await amqp.connect(url);

    this.connection.on('error', (err) => {
      this.logger.error(`RabbitMQ connection error: ${(err as Error).message}`);
    });

    this.connection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');
      this.channel = null;
      this.consumerTag = null;
      this.connection = null;
      this.consuming = false;
      if (this.shouldRetry) {
        this.reconnect();
      }
    });

    this.channel = await this.connection.createChannel();

    this.channel.on('error', (err) => {
      this.logger.error(`RabbitMQ channel error: ${(err as Error).message}`);
    });

    this.channel.on('close', () => {
      this.logger.warn('RabbitMQ channel closed');
      this.channel = null;
      this.consumerTag = null;
      this.consuming = false;
    });

    await this.channel.assertExchange(this.exchange, 'topic', {
      durable: true,
    });

    await this.channel.assertQueue(this.queue, { durable: true });

    this.logger.log(
      `Connected to RabbitMQ at ${rmqConfig.host}:${rmqConfig.port}`,
    );

    if (this.subscribers.size > 0) {
      await this.startConsuming();
    }
  }

  private async reconnect(): Promise<void> {
    this.logger.log('Attempting RabbitMQ reconnection...');
    await this.connectWithRetry(this.rmqConfig);
  }

  async publish(
    routingKey: string,
    message: RabbitMQMessage,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.warn('RabbitMQ not connected, skipping publish');
      return;
    }

    try {
      this.channel.publish(
        this.exchange,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true },
      );
    } catch (err) {
      this.logger.error(`Failed to publish message: ${(err as Error).message}`);
    }
  }

  async subscribe(
    pattern: string,
    callback: (msg: RabbitMQMessage) => void,
  ): Promise<void> {
    this.subscribers.set(pattern, callback);

    if (this.consuming && this.channel) {
      await this.bindPattern(pattern);
    }
  }

  private async bindPattern(pattern: string): Promise<void> {
    if (!this.channel) return;
    const routingKey = this.buildRoutingKey(pattern);
    try {
      await this.channel.bindQueue(this.queue, this.exchange, routingKey);
    } catch (err) {
      this.logger.error(`Failed to bind pattern ${pattern}: ${(err as Error).message}`);
    }
  }

  private buildRoutingKey(pattern: string): string {
    const dot = pattern.indexOf('.');
    if (dot === -1) return pattern + '.#';
    return pattern.slice(0, dot) + '.#' + pattern.slice(dot) + '.#';
  }

  async startConsuming(): Promise<void> {
    if (!this.channel) {
      this.logger.warn('RabbitMQ not connected, cannot start consuming');
      return;
    }

    if (this.consumerTag) {
      try {
        await this.channel.cancel(this.consumerTag);
      } catch {
        // ignore cancel errors on reconnect
      }
      this.consumerTag = null;
    }

    for (const [pattern] of this.subscribers) {
      const routingKey = this.buildRoutingKey(pattern);
      await this.channel.bindQueue(this.queue, this.exchange, routingKey);
    }

    this.consuming = true;

    const { consumerTag } = await this.channel.consume(
      this.queue,
      (msg) => {
        if (!msg) return;

        try {
          const content: RabbitMQMessage = JSON.parse(
            msg.content.toString(),
          );

          this.logger.log(
            `Consumed message | pattern: ${content.pattern} | providerKey: ${content.providerKey || 'N/A'} | timestamp: ${content.timestamp}`,
          );

          for (const [pattern, callback] of this.subscribers) {
            if (content.pattern === pattern) {
              callback(content);
            }
          }

          this.channel?.ack(msg);
        } catch (err) {
          this.logger.error(
            `Failed to process message: ${(err as Error).message}`,
          );
          this.channel?.nack(msg, false, false);
        }
      },
      { noAck: false },
    );

    this.consumerTag = consumerTag;

    this.logger.log(
      `Started consuming from queue "${this.queue}" on exchange "${this.exchange}"`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy() {
    this.shouldRetry = false;
    try {
      if (this.consumerTag && this.channel) {
        await this.channel.cancel(this.consumerTag);
      }
      await this.channel?.close();
      await this.connection?.close();
    } catch (err) {
      this.logger.error(
        `Error closing RabbitMQ connection: ${(err as Error).message}`,
      );
    }
  }
}
