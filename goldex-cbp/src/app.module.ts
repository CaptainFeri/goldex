import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import appEnvConfig from "./config/env.config";
import { PaymentsModule } from "./payments/payments.module";
import { PaymentBusModule } from "./payments/payment-bus/payment-bus.module";
import { RabbitMQModule } from "./rabbitmq/rabbitmq.module";
import { SymbolsModule } from "./symbols/symbols.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appEnvConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const app = configService.get("app") ?? {};
        const pg = app.postgres ?? {};
        return {
          type: "postgres",
          host: pg.host,
          port: pg.port,
          username: pg.username,
          password: pg.password,
          database: pg.database,
          autoLoadEntities: true,
          synchronize: pg.synchronize,
          retryAttempts: 30,
          retryDelay: 5000,
          keepConnectionAlive: true,
          extra: {
            max: 10,
            min: 1,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            keepAlive: true,
            application_name: "goldex-cbp",
          },
        };
      },
    }),
    RabbitMQModule,
    SymbolsModule,
    PaymentsModule,
    PaymentBusModule,
  ],
})
export class AppModule {}
