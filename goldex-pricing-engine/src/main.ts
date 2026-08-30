import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

/**
 * Headless pricing worker. All provider-management and market REST endpoints
 * live in goldex-backend; this process only streams prices and consumes
 * RabbitMQ commands. The HTTP listener is kept as a bare liveness surface.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`Pricing Engine running (headless worker) on http://localhost:${port}`);
}

void bootstrap();
