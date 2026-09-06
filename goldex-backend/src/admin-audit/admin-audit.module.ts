import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAuditController } from "./admin-audit.controller";
import { AdminAuditService } from "./admin-audit.service";
import { AdminAuditInterceptor } from "./admin-audit.interceptor";
import { AdminAuditLogEntity } from "./entity/admin-audit-log.entity";

/**
 * Global so the interceptor can be registered app-wide and any module can
 * inject the service to record a "before" snapshot, without every module
 * having to import this one.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLogEntity])],
  controllers: [AdminAuditController],
  providers: [
    AdminAuditService,
    AdminAuditInterceptor,
    // Registered here rather than in main.ts because it needs DI, and globally
    // rather than per-controller because opt-in coverage is not an audit trail.
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
  ],
  exports: [AdminAuditService, AdminAuditInterceptor],
})
export class AdminAuditModule {}
