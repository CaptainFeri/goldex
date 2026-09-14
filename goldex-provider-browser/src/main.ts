import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * A browser an admin drives from the panel, to sign in to a provider whose
 * login the pricing engine cannot drive itself — behind a captcha, or with a
 * login API nobody has worked out.
 *
 * Bound to the docker network only. It is reached through the backend, which
 * is what authenticates the admin; nothing here should ever be published.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (!process.env.BROWSER_SERVICE_TOKEN?.trim()) {
    logger.warn(
      'BROWSER_SERVICE_TOKEN is not set — every request will be refused until it is',
    );
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Provider browser listening on ${port}`);
}

void bootstrap();
