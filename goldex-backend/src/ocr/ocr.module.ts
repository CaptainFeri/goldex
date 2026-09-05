import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OcrService } from "./ocr.service";
import { OcrController } from "./ocr.controller";
import { OcrRabbitmqService } from "./ocr-rabbitmq.service";
import { DepositEntity } from "../deposit/deposit.entity";
import { WithdrawEntity } from "../withdraw/withdraw.entity";

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([DepositEntity, WithdrawEntity])],
  providers: [OcrService, OcrRabbitmqService],
  controllers: [OcrController],
  exports: [OcrService],
})
export class OcrModule {}
