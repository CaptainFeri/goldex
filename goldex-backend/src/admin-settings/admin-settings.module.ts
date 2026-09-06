import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminEntity } from "../admin/entity/admin.entity";
import { AdminSettingsController } from "./admin-settings.controller";
import { AdminSettingsService } from "./admin-settings.service";
import { AdminSettingsEntity } from "./entity/admin-settings.entity";
import { PlatformSettingsEntity } from "./entity/platform-settings.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AdminSettingsEntity, PlatformSettingsEntity, AdminEntity])],
  controllers: [AdminSettingsController],
  providers: [AdminSettingsService],
  exports: [AdminSettingsService],
})
export class AdminSettingsModule {}
