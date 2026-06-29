import { Module } from "@nestjs/common";
import { AdminManagementService } from "./admin-management.service";
import { AdminManagementController } from "./admin-management.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminEntity } from "../admin/entity/admin.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AdminEntity])],
  providers: [AdminManagementService],
  controllers: [AdminManagementController],
})
export class AdminManagementModule {}
