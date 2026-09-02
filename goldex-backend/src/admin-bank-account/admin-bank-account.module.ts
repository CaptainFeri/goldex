import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminBankAccountEntity } from "./entity/admin-bank-account.entity";
import { AdminBankAccountService } from "./admin-bank-account.service";
import { AdminBankAccountController } from "./admin-bank-account.controller";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AdminBankAccountEntity, SymbolEntity])],
  controllers: [AdminBankAccountController],
  providers: [AdminBankAccountService],
  exports: [AdminBankAccountService, TypeOrmModule],
})
export class AdminBankAccountModule {}
