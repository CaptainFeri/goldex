import { Module, Global, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQService } from './rabbitmq.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'RABBITMQ_CONNECTION',
      useFactory: async (configService: ConfigService): Promise<amqp.ChannelModel | null> => {
        const buildUrl = () =>
          configService.get<string>('RABBITMQ_URL') ||
          `amqp://${configService.get<string>('RABBITMQ_USER', 'guest')}:${configService.get<string>('RABBITMQ_PASS', 'guest')}@${configService.get<string>('RABBITMQ_HOST', 'localhost')}:${configService.get<string>('RABBITMQ_PORT', '5672')}`;

        const logger = new Logger('RabbitMQModule');
        const maxRetryDelay = 30000;
        const initialRetryDelay = 1000;
        let attempt = 0;

        while (true) {
          try {
            const url = buildUrl();
            const conn = await amqp.connect(url);
            logger.log(`Connected to RabbitMQ at ${url.replace(/:\/\/.*@/, '://***@')}`);
            return conn;
          } catch (error) {
            attempt++;
            const message = error instanceof Error ? error.message : String(error);
            const delay = Math.min(initialRetryDelay * Math.pow(2, attempt - 1), maxRetryDelay);
            logger.warn(
              `RabbitMQ connection attempt ${attempt} failed (${message}), retrying in ${delay}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      },
      inject: [ConfigService],
    },
    RabbitMQService,
  ],
  exports: [RabbitMQService],
})
export class RabbitMQModule {}

export { RabbitMQService, RabbitMQMessage } from './rabbitmq.service';
export { MessagePatterns, getRoutingKey } from './message-patterns.constant';
