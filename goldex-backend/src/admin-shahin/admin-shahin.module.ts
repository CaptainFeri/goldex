import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OperationOtpModule } from "../operation-otp/operation-otp.module";
import { ShahinModule } from "../shahin/shahin.module";
import { ShahinAccount } from "../shahin/entities/shahin-account.entity";
import { ShahinEntry } from "../shahin/entities/shahin-entry.entity";
import { AdminShahinController } from "./admin-shahin.controller";
import { AdminShahinService } from "./admin-shahin.service";
import { ShahinExportService } from "./shahin-export.service";

@Module({
  // ShahinModule for the one upstream client; OperationOtpModule for the guard
  // on the money-moving routes.
  imports: [TypeOrmModule.forFeature([ShahinAccount, ShahinEntry]), ShahinModule, OperationOtpModule],
  controllers: [AdminShahinController],
  providers: [AdminShahinService, ShahinExportService],
  exports: [AdminShahinService],
})
export class AdminShahinModule {}
