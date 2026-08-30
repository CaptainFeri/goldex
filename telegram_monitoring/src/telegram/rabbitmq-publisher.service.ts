import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMQPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQPublisherService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private exchange: string;
  private url: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('RABBITMQ_HOST', 'localhost');
    const port = config.get<number>('RABBITMQ_PORT', 5672);
    const user = config.get<string>('RABBITMQ_USER', 'guest');
    const pass = config.get<string>('RABBITMQ_PASS', 'guest');
    this.exchange = config.get<string>('RABBITMQ_EXCHANGE', 'signalr.providers');
    this.url = `amqp://${user}:${pass}@${host}:${port}`;
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.url);
      this.connection.on('error', (err) => this.logger.error(`RabbitMQ connection error: ${(err as Error).message}`));
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.channel = null;
        this.connection = null;
      });

      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
      this.logger.log(`Connected to RabbitMQ exchange "${this.exchange}"`);
    } catch (err) {
      this.logger.warn(`Failed to connect to RabbitMQ at ${this.url}: ${(err as Error).message}`);
    }
  }

  async publish(routingKey: string, data: unknown): Promise<void> {
    if (!this.channel) {
      this.logger.warn('RabbitMQ not connected, skipping publish');
      return;
    }

    const message = {
      pattern: routingKey,
      data,
      timestamp: new Date().toISOString(),
      providerKey: 'telegram',
    };

    try {
      this.channel.publish(this.exchange, routingKey, Buffer.from(JSON.stringify(message)), { persistent: true });
    } catch (err) {
      this.logger.error(`Failed to publish message: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // ignore close errors
    }
  }
}
