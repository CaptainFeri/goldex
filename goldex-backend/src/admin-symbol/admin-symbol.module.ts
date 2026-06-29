import { Module } from "@nestjs/common";
import { AdminSymbolController } from "./admin-symbol.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SymbolEntity } from "./entity/symbol.entity";
import { AdminSymbolService } from "./admin-symbol.service";

@Module({
  imports: [TypeOrmModule.forFeature([SymbolEntity])],
  providers: [AdminSymbolService],
  controllers: [AdminSymbolController],
})
export class AdminSymbolModule {}
