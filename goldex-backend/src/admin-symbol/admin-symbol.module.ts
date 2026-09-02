import { Module } from "@nestjs/common";
import { AdminSymbolController } from "./admin-symbol.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SymbolEntity } from "./entity/symbol.entity";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { UserEntity } from "../user/entity/user.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { AdminSymbolService } from "./admin-symbol.service";
import { PaymentBusModule } from "../payment-bus/payment-bus.module";
import { SymbolCapabilitiesService } from "./symbol-capabilities.service";
import { CbpAdminModule } from "../cbp-admin/cbp-admin.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([SymbolEntity, UserMarketTypeEntity, UserEntity, WalletEntity]),
    PaymentBusModule,
    // The gateway registry lives in goldex-cbp; CbpAdminService is the RPC client.
    CbpAdminModule,
  ],
  providers: [AdminSymbolService, SymbolCapabilitiesService],
  controllers: [AdminSymbolController],
  exports: [SymbolCapabilitiesService],
})
export class AdminSymbolModule {}
