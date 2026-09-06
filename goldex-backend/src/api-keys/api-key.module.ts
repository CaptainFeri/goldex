import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ApiKeyController } from "./api-key.controller";
import { ApiKeyService } from "./api-key.service";
import { ApiKeyUsageInterceptor } from "./api-key-usage.interceptor";
import { ApiKeyGuard } from "./guard/api-key.guard";
import { ApiKeyEntity } from "./entity/api-key.entity";
import { ApiKeyUsageEntity } from "./entity/api-key-usage.entity";

@Module({
  imports: [TypeOrmModule.forFeature([ApiKeyEntity, ApiKeyUsageEntity])],
  controllers: [ApiKeyController],
  providers: [ApiKeyService, ApiKeyGuard, ApiKeyUsageInterceptor],
  // Exported so any module can put `@ApiKeyAuth()` on a route and have the
  // guard and the usage interceptor resolve.
  exports: [ApiKeyService, ApiKeyGuard, ApiKeyUsageInterceptor],
})
export class ApiKeyModule {}
