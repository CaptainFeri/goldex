import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEntity } from './entities/wallet.entity';
import { TransactionEntity } from './entities/transaction.entity';
import { WalletOrderService } from './services/wallet-order.service';

@Module({
  imports: [TypeOrmModule.forFeature([WalletEntity, TransactionEntity])],
  providers: [WalletOrderService],
  exports: [WalletOrderService],
})
export class WalletCoreModule {}
