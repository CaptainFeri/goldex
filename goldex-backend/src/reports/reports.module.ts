import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrderEntity } from "../order/order.entity";
import { UserEntity } from "../user/entity/user.entity";
import { WithdrawEntity } from "../withdraw/withdraw.entity";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { ReportBuilderService } from "./report-builder.service";
import { ReportRunnerService } from "./report-runner.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { ReportDownloadEntity } from "./entity/report-download.entity";
import { ReportJobEntity } from "./entity/report-job.entity";
import { ReportScheduleEntity } from "./entity/report-schedule.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportJobEntity,
      ReportScheduleEntity,
      ReportDownloadEntity,
      // Read-only, for the exports themselves.
      OrderEntity,
      UserEntity,
      WithdrawEntity,
      SystemLedgerEntity,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportBuilderService, ReportRunnerService],
  exports: [ReportsService],
})
export class ReportsModule {}
