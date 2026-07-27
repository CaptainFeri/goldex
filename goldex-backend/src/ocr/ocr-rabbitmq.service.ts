import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as amqp from 'amqplib';
import { DepositEntity } from '../deposit/deposit.entity';
import { WithdrawEntity } from '../withdraw/withdraw.entity';

interface OcrResultData {
  request_id: string;
  status: 'completed' | 'failed';
  parsed_data?: Record<string, any>;
  raw_text?: string;
  processing_time_ms?: number;
  error?: string;
  entity_type?: 'deposit' | 'withdraw';
  entity_id?: string;
}

@Injectable()
export class OcrRabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrRabbitmqService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private consumerTag: string | null = null;
  private shouldRetry = true;

  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly pass: string;
  private readonly resultExchange: string;
  private readonly resultRoutingKey: string;
  private readonly queue: string;
  private readonly requestQueue: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(DepositEntity)
    private readonly depositRepo: Repository<DepositEntity>,
    @InjectRepository(WithdrawEntity)
    private readonly withdrawRepo: Repository<WithdrawEntity>,
  ) {
    const ocrConfig = this.configService.get('ocr');
    const rmqConfig = this.configService.get('rabbitmq');
    this.host = rmqConfig?.host || 'localhost';
    this.port = rmqConfig?.port || 5672;
    this.user = rmqConfig?.user || 'guest';
    this.pass = rmqConfig?.pass || 'guest';
    this.resultExchange = ocrConfig?.rabbitmqResultExchange || 'ocr_results';
    this.resultRoutingKey = ocrConfig?.rabbitmqResultRoutingKey || 'ocr.result';
    this.queue = 'goldex.backend.ocr.results';
    this.requestQueue = ocrConfig?.rabbitmqRequestQueue || 'ocr_requests';
  }

  async onModuleInit() {
    const mode = this.configService.get('ocr')?.mode || 'http';
    if (mode === 'rabbitmq') {
      await this.connect();
    } else {
      this.logger.log('OCR mode is HTTP, RabbitMQ consumer disabled');
    }
  }

  private async connect(): Promise<void> {
    try {
      const url = `amqp://${this.user}:${this.pass}@${this.host}:${this.port}`;
      this.connection = await amqp.connect(url);

      this.connection.on('error', (err) => {
        this.logger.error(`OCR RabbitMQ connection error: ${(err as Error).message}`);
      });
      this.connection.on('close', () => {
        this.logger.warn('OCR RabbitMQ connection closed');
        this.channel = null;
        this.consumerTag = null;
      });

      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange(this.resultExchange, 'topic', { durable: true });
      await this.channel.assertQueue(this.queue, { durable: true });
      await this.channel.bindQueue(this.queue, this.resultExchange, this.resultRoutingKey + '.#');

      const { consumerTag } = await this.channel.consume(
        this.queue,
        (msg) => {
          if (!msg) return;
          this.handleMessage(msg);
        },
        { noAck: false },
      );

      this.consumerTag = consumerTag;
      this.logger.log(`OCR RabbitMQ consumer ready on exchange "${this.resultExchange}"`);
    } catch (err) {
      this.logger.error(`Failed to connect OCR RabbitMQ: ${(err as Error).message}`);
    }
  }

  private async handleMessage(msg: amqp.ConsumeMessage): Promise<void> {
    try {
      const content = JSON.parse(msg.content.toString()) as OcrResultData;

      this.logger.log(`OCR result: ${content.status} for request ${content.request_id}`);

      if (content.status === 'completed' && content.entity_type && content.entity_id) {
        await this.updateEntity(content);
      }

      this.channel?.ack(msg);
    } catch (err) {
      this.logger.error(`Failed to handle OCR result message: ${(err as Error).message}`);
      this.channel?.nack(msg, false, false);
    }
  }

  private async updateEntity(data: OcrResultData): Promise<void> {
    const ocrMetadata = {
      parsed: data.parsed_data || {},
      raw_text: data.raw_text || '',
      processing_time_ms: data.processing_time_ms || 0,
      completed_at: new Date().toISOString(),
    };

    if (data.entity_type === 'deposit') {
      const deposit = await this.depositRepo.findOne({ where: { id: data.entity_id } });
      if (deposit) {
        deposit.metadata = { ...(deposit.metadata || {}), ocr: ocrMetadata };
        await this.depositRepo.save(deposit);
        this.logger.log(`Updated deposit ${data.entity_id} with OCR result`);
      }
    } else if (data.entity_type === 'withdraw') {
      const withdraw = await this.withdrawRepo.findOne({ where: { id: data.entity_id } });
      if (withdraw) {
        withdraw.metadata = { ...(withdraw.metadata || {}), ocr: ocrMetadata };
        await this.withdrawRepo.save(withdraw);
        this.logger.log(`Updated withdraw ${data.entity_id} with OCR result`);
      }
    }
  }

  async publishRequest(message: {
    request_id: string;
    entity_type: 'deposit' | 'withdraw';
    entity_id: string;
    image_base64: string;
    language?: string;
  }): Promise<void> {
    if (!this.channel) {
      this.logger.warn('OCR RabbitMQ not connected, cannot publish');
      return;
    }

    try {
      await this.channel.assertQueue(this.requestQueue, { durable: true });
      this.channel.sendToQueue(
        this.requestQueue,
        Buffer.from(JSON.stringify(message)),
        { persistent: true },
      );
      this.logger.log(`Published OCR request ${message.request_id} for ${message.entity_type} ${message.entity_id}`);
    } catch (err) {
      this.logger.error(`Failed to publish OCR request: ${(err as Error).message}`);
    }
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
      this.logger.error(`Error closing OCR RabbitMQ: ${(err as Error).message}`);
    }
  }
}
