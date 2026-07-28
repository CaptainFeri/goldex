import { IsEnum, IsObject, IsOptional, IsString } from "class-validator";
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

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: "Picture path from upload-and-ocr (admin uploads receipt)" })
  picturePath?: string;

  @IsOptional()
  @IsObject()
  @ApiProperty({ required: false, description: "Updated OCR parsed data to save as metadata.ocr" })
  metadata?: Record<string, any>;
}
