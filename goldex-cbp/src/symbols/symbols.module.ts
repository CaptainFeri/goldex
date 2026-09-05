import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GatewaysModule } from "../payments/gateways/gateways.module";
import { PaymentSymbolEntity } from "./entity/payment-symbol.entity";
import { SymbolsService } from "./symbols.service";

/**
 * Symbols are synced from goldex-backend via `symbol.sync` messages;
 * no HTTP surface of their own.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PaymentSymbolEntity]), GatewaysModule],
  providers: [SymbolsService],
  exports: [SymbolsService],
})
export class SymbolsModule {}
