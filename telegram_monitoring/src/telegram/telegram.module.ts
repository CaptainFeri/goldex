import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { SessionManagerService } from './session-manager.service';
import { TELEGRAM_OPTIONS } from './telegram.constants';
import { TelegramOptions } from './interfaces';
import { PriceHistoryService } from './price/price-history.service';
import { PricePersistenceService } from './price/price-persistence.service';
import { ArbitragePersistenceService } from './price/arbitrage-persistence.service';
import { ChartImageService } from './price/chart-image.service';
import { PriceController, ArbitrageController } from './price/price.controller';
import { AuthController } from './auth/auth.controller';

@Global()
@Module({})
export class TelegramModule {
  static forRoot(options: TelegramOptions): DynamicModule {
    return {
      module: TelegramModule,
      controllers: [PriceController, ArbitrageController, AuthController],
      providers: [
        {
          provide: TELEGRAM_OPTIONS,
          useValue: options,
        },
        SessionManagerService,
        PriceHistoryService,
        PricePersistenceService,
        ArbitragePersistenceService,
        ChartImageService,
        TelegramService,
      ],
      exports: [TelegramService, PriceHistoryService],
    };
  }

  static forRootAsync(): DynamicModule {
    return {
      module: TelegramModule,
      imports: [ConfigModule],
      controllers: [PriceController, ArbitrageController, AuthController],
      providers: [
        {
          provide: TELEGRAM_OPTIONS,
          inject: [ConfigService],
          useFactory: (config: ConfigService): TelegramOptions => ({
            apiId: config.get<number>('telegram.apiId', 0),
            apiHash: config.get<string>('telegram.apiHash', ''),
            phoneNumber: config.get<string>('telegram.phoneNumber', ''),
            password: config.get<string>('telegram.password'),
            sessionString: config.get<string>('telegram.sessionString'),
            sessionFolder: config.get<string>(
              'telegram.sessionFolder',
              'sessions',
            ),
            monitoredChannels: config.get('telegram.monitoredChannels'),
            targetChannel: config.get<string>('telegram.targetChannel', ''),
          }),
        },
        SessionManagerService,
        PriceHistoryService,
        PricePersistenceService,
        ArbitragePersistenceService,
        ChartImageService,
        TelegramService,
      ],
      exports: [TelegramService, PriceHistoryService],
    };
  }
}
