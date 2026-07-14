import { Module } from "@nestjs/common";
import { AdminSymbolController } from "./admin-symbol.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SymbolEntity } from "./entity/symbol.entity";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { UserEntity } from "../user/entity/user.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { AdminSymbolService } from "./admin-symbol.service";

@Module({
  imports: [TypeOrmModule.forFeature([SymbolEntity, UserMarketTypeEntity, UserEntity, WalletEntity])],
  providers: [AdminSymbolService],
  controllers: [AdminSymbolController],
})
export class AdminSymbolModule {}
