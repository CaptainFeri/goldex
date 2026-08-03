import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RealtimeProviderModule } from './real-time-provider/realtime-provider.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { ArbitrageModule } from './arbitrage/arbitrage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: true,
        retryAttempts: 30,
        retryDelay: 5000,
        keepConnectionAlive: true,
        extra: {
          max: 10,
          min: 1,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
          keepAlive: true,
          application_name: "goldex-pricing-engine",
        },
      }),
      inject: [ConfigService],
    }),
    RabbitMQModule,
    RealtimeProviderModule,
    ArbitrageModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
