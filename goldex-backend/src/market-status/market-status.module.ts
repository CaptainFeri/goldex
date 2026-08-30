import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PairPoolStatusEntity } from './entity/pair-pool-status.entity';
import { PricePairEntity } from '../admin-pair/entity/price.pair.entity';
import { OrderEntity } from '../order/order.entity';
import { MarketStatusService } from './market-status.service';
import { MarketCloseService } from './market-close.service';
import { MarketStatusController } from './market-status.controller';
import { WalletCoreModule } from '../wallet/wallet-core.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PairPoolStatusEntity, PricePairEntity, OrderEntity]),
    WalletCoreModule,
  ],
  providers: [MarketStatusService, MarketCloseService],
  controllers: [MarketStatusController],
  exports: [MarketStatusService, MarketCloseService],
})
export class MarketStatusModule {}
