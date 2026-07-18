import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminScheduleService } from "./admin-schedule.service";
import { AdminScheduleController } from "./admin-schedule.controller";
import { AdminScheduleEntity } from "./entity/admin-schedule.entity";
import { AdminWorkTimeGuard } from "./admin-work-time.guard";

@Module({
  imports: [TypeOrmModule.forFeature([AdminScheduleEntity])],
  controllers: [AdminScheduleController],
  providers: [AdminScheduleService, AdminWorkTimeGuard],
  exports: [AdminScheduleService, AdminWorkTimeGuard],
})
export class AdminScheduleModule {}
