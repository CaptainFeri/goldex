import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderEntity } from './entity/provider.entity';
import { ProviderService } from './provider.service';
import { ProviderController } from './provider.controller';
import { ProviderStatusConsumer } from '../rabbitmq/consumers/provider-status.consumer';
import { ProviderDealSnapshotEntity } from '../financial/entity/provider-deal-snapshot.entity';
import { ProviderBalanceSnapshotEntity } from '../financial/entity/provider-balance-snapshot.entity';
import { AdminMonitoringModule } from '../admin-monitoring/admin-monitoring.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProviderEntity,
      ProviderDealSnapshotEntity,
      ProviderBalanceSnapshotEntity,
    ]),
    AdminMonitoringModule,
  ],
  providers: [ProviderService, ProviderStatusConsumer],
  controllers: [ProviderController],
  exports: [ProviderService],
})
export class ProviderModule {}