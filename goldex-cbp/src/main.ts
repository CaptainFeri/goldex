import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: "v",
    defaultVersion: "1",
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Goldex Payment")
    .setDescription("Payment management & gateway aggregation service")
    .setVersion("1.0")
    .build();
  SwaggerModule.setup(
    "swagger",
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const configService = app.get(ConfigService);
  const port = configService.get("app")?.port ?? 4100;
  await app.listen(port);
  Logger.log(`Payment service running on http://localhost:${port}/api/v1`);
}
bootstrap();
