import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import basicAuth from "express-basic-auth";
import { ConfigService, ConfigType } from "@nestjs/config";
import appEnvConfig from "./config/app.env.config";
import { ResponseInterceptor } from "./shared/interceptor/response.interceptor";
import { HttpExceptionFilter } from "./shared/filter/http.filter";
import { configureSwagger } from "./config/swagger.config";
import { WinstonLoggerService } from "./logger/winston.logger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<ConfigType<typeof appEnvConfig>>);

  const swaggerInfo = configService.get("swagger", { infer: true });
  app.use(
    ["/swagger", "/swagger-json"],
    basicAuth({
      challenge: true,
      users: {
        [swaggerInfo.username]: swaggerInfo.password,
      },
    })
  );

  app.setGlobalPrefix("api");

  app.useGlobalPipes(new ValidationPipe());

  app.enableVersioning({
    type: VersioningType.URI,
    prefix: "v",
    defaultVersion: "1",
  });
  const logger = app.get(WinstonLoggerService);
  app.useGlobalFilters(new HttpExceptionFilter(logger));
  app.useGlobalInterceptors(new ResponseInterceptor(logger));

  // Call Swagger configuration
  configureSwagger(app);

  // Other app configurations (e.g., CORS)
  app.enableCors();

  await app.listen(process.env.GOLDEX_APP_INTERNAL_PORT);
}
bootstrap();
