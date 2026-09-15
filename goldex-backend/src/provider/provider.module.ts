import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderEntity } from './entity/provider.entity';
import { ProviderService } from './provider.service';
import { ProviderController } from './provider.controller';
import { ProviderStatusConsumer } from '../rabbitmq/consumers/provider-status.consumer';
import { ProviderDealSnapshotEntity } from '../financial/entity/provider-deal-snapshot.entity';
import { ProviderBalanceSnapshotEntity } from '../financial/entity/provider-balance-snapshot.entity';
import { AdminMonitoringModule } from '../admin-monitoring/admin-monitoring.module';
import { RedisModule } from '../redis/redis.module';
import { ProviderAutoLoginService } from './provider-auto-login.service';
import { ProviderLoginDeviceEntity } from './entity/provider-login-device.entity';
import { LoginDeviceService } from './device/login-device.service';
import { DeviceAuthGuard } from './device/device-auth.guard';
import { LoginDeviceController } from './device/login-device.controller';
import { ProviderDeviceController } from './device/provider-device.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProviderEntity,
      ProviderDealSnapshotEntity,
      ProviderBalanceSnapshotEntity,
      ProviderLoginDeviceEntity,
    ]),
    AdminMonitoringModule,
    RedisModule,
  ],
  providers: [
    ProviderService,
    ProviderAutoLoginService,
    LoginDeviceService,
    DeviceAuthGuard,
    ProviderStatusConsumer,
  ],
  controllers: [ProviderController, LoginDeviceController, ProviderDeviceController],
  exports: [ProviderService],
})
export class ProviderModule {}