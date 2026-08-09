import { Module } from "@nestjs/common";
import { CbpAdminController } from "./cbp-admin.controller";
import { CbpAdminService } from "./cbp-admin.service";

@Module({
  providers: [CbpAdminService],
  controllers: [CbpAdminController],
  exports: [CbpAdminService],
})
export class CbpAdminModule {}
