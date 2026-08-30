import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from '../redis/redis.module';
import { ItemMetadataService } from './item-metadata.service';
import { ProviderManagerService } from './provider-manage.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderEntity } from './entity/provider.entity';
import { ProviderDealEntity } from './entity/provider-deal.entity';
import { ProviderBalanceEntity } from './entity/provider-balance.entity';
import { ProviderService } from './provider.service';
import { ProviderAccountService } from './provider-account.service';
import { ProviderOrderService } from './provider-order.service';
import { ProviderManageConsumer } from './provider-manage.consumer';
import { TalaabOtpHandler } from './providers/talaab-otp.handler';
import { ZaryarOtpHandler } from './providers/zaryar-otp.handler';
import { OtpHandler } from './interfaces/otp-handler.interface';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import { ProviderCategory } from './types';
import { buildHttpProxyConfig } from '../common/http/proxy.config';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ProviderEntity, ProviderDealEntity, ProviderBalanceEntity]), HttpModule.registerAsync({
    useFactory: () => buildHttpProxyConfig(),
  }), RedisModule],
  controllers: [],
  providers: [
    ProviderManagerService,
    ItemMetadataService,
    ProviderService,
    ProviderAccountService,
    ProviderOrderService,
    ProviderManageConsumer,
    TalaabOtpHandler,
    ZaryarOtpHandler,
    ConsoleFormatterService,
    {
      provide: 'OTP_HANDLERS',
      useFactory: (talaab: TalaabOtpHandler, zaryar: ZaryarOtpHandler) => {
        const map = new Map<string, OtpHandler>();
        map.set(ProviderCategory.TALAAB, talaab);
        map.set(ProviderCategory.ZARYAR, zaryar);
        return map;
      },
      inject: [TalaabOtpHandler, ZaryarOtpHandler],
    },
  ],
  exports: [ProviderManagerService, ItemMetadataService, ProviderService, ProviderAccountService],
})
export class RealtimeProviderModule {}
