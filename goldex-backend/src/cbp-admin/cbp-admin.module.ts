import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { CbpAdminController } from "./cbp-admin.controller";

@Module({
  imports: [HttpModule],
  controllers: [CbpAdminController],
})
export class CbpAdminModule {}
