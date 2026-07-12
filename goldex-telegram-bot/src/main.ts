import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const port = process.env.TELEGRAM_BOT_PORT || 3000;
  await app.listen(port);
  Logger.log(`Telegram bot service is running on port ${port}`);
}
bootstrap();
