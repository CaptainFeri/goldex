import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService, ConfigType } from '@nestjs/config';
import * as amqp from 'amqplib';
import appEnvConfig from '../config/app.env.config';
import { randomUUID } from 'crypto';
import {
  CommandReply,
  RabbitMQMessage,
} from './interfaces/rabbitmq.interfaces';

@Injectable()
export class RabbitMQService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private exchange: string;
  private queue: string;
  /**
   * Handlers per pattern — a list, not one each.
   *
   * More than one module legitimately cares about the same message: a provider
   * order status settles a customer's order *and* an arbitrage bot's leg.
   * Keeping a single callback per pattern silently replaced one with the other
   * depending on module init order, and the loser's messages vanished without
   * a trace.
   */
  private subscribers: Map<string, ((msg: RabbitMQMessage) => void)[]> = new Map();
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

  /**
   * Publish a provider-management command to the pricing-engine on the command
   * routing key. The engine binds its dedicated command queue to these keys.
   */
  async publishCommand(
    pattern: string,
    data: unknown,
    providerKey?: string,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.warn('RabbitMQ not connected, skipping command publish');
      return;
    }

    const message: RabbitMQMessage = {
      pattern,
      data,
      timestamp: new Date().toISOString(),
      providerKey,
    };

    try {
      this.channel.publish(
        this.exchange,
        pattern,
        Buffer.from(JSON.stringify(message)),
        { persistent: true },
      );
    } catch (err) {
      this.logger.error(
        `Failed to publish command ${pattern}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Publish a command and wait for the engine to say what happened.
   *
   * `publishCommand` is right for anything whose outcome the caller does not
   * need — a refresh, a balance fetch. It is wrong for activation: the engine
   * is the only thing that knows whether the provider accepted the code, and
   * a fire-and-forget send left the panel reporting success over a rejected
   * OTP, with the real error buried in the engine's container log.
   *
   * One exclusive reply queue per call, torn down when the call ends. Cheap
   * enough at this rate — activation is something a person does — and it
   * cannot leak replies between concurrent callers the way a shared queue
   * could if a correlation id were ever reused.
   */
  async requestCommand<T = unknown>(
    pattern: string,
    data: unknown,
    providerKey?: string,
    timeoutMs = 20000,
  ): Promise<CommandReply<T>> {
    if (!this.channel) {
      throw new Error('RabbitMQ is not connected');
    }
    const channel = this.channel;

    const { queue: replyTo } = await channel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
      durable: false,
    });
    const correlationId = randomUUID();

    let consumerTag: string | null = null;
    let timer: NodeJS.Timeout | null = null;

    const cleanup = async () => {
      if (timer) clearTimeout(timer);
      try {
        if (consumerTag) await channel.cancel(consumerTag);
        await channel.deleteQueue(replyTo);
      } catch {
        /* the queue is exclusive and auto-deletes with the channel anyway */
      }
    };

    try {
      return await new Promise<CommandReply<T>>((resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `The pricing engine did not answer ${pattern} within ${Math.round(timeoutMs / 1000)}s`,
              ),
            ),
          timeoutMs,
        );

        void channel
          .consume(
            replyTo,
            (msg) => {
              if (!msg || msg.properties.correlationId !== correlationId) return;
              try {
                resolve(JSON.parse(msg.content.toString()) as CommandReply<T>);
              } catch (err) {
                reject(new Error(`Unreadable reply to ${pattern}: ${(err as Error).message}`));
              }
            },
            { noAck: true },
          )
          .then(({ consumerTag: tag }) => {
            consumerTag = tag;
            const message: RabbitMQMessage = {
              pattern,
              data,
              timestamp: new Date().toISOString(),
              providerKey,
              replyTo,
              correlationId,
            };
            channel.publish(
              this.exchange,
              pattern,
              Buffer.from(JSON.stringify(message)),
              { persistent: true, replyTo, correlationId },
            );
          })
          .catch(reject);
      });
    } finally {
      await cleanup();
    }
  }

  async subscribe(
    pattern: string,
    callback: (msg: RabbitMQMessage) => void,
  ): Promise<void> {
    const existing = this.subscribers.get(pattern) ?? [];
    this.subscribers.set(pattern, [...existing, callback]);

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

          const handlers = this.subscribers.get(content.pattern) ?? [];
          if (handlers.length === 0) {
            // Nothing is listening. Worth saying: a consumed message with no
            // handler looks identical to a handled one in the log, which is
            // what let a lost order settlement go unnoticed.
            this.logger.warn(
              `No handler registered for pattern ${content.pattern}; message dropped`,
            );
          }
          for (const callback of handlers) {
            try {
              callback(content);
            } catch (err) {
              // One handler failing must not rob the others of the message.
              this.logger.error(
                `Handler for ${content.pattern} threw: ${(err as Error).message}`,
              );
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
