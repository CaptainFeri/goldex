import { IsEnum, IsOptional, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { WithdrawStatusEnum } from "../enum/withdraw-status.enum";

export class ProcessWithdrawDto {
  @IsEnum(WithdrawStatusEnum)
  @ApiProperty({ enum: WithdrawStatusEnum })
  status: WithdrawStatusEnum;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  notes?: string;
}
