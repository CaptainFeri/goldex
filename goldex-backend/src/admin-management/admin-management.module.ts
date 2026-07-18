import { Module } from "@nestjs/common";
import { AdminManagementService } from "./admin-management.service";
import { AdminManagementController } from "./admin-management.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminEntity } from "../admin/entity/admin.entity";
import { AdminScheduleEntity } from "../admin-schedule/entity/admin-schedule.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AdminEntity, AdminScheduleEntity])],
  providers: [AdminManagementService],
  controllers: [AdminManagementController],
})
export class AdminManagementModule {}
