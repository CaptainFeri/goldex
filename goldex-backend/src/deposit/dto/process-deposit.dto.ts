import { IsEnum, IsObject, IsOptional, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { DepositStatusEnum } from "../enum/deposit-status.enum";

export class ProcessDepositDto {
  @IsEnum(DepositStatusEnum)
  @ApiProperty({ enum: DepositStatusEnum })
  status: DepositStatusEnum;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  notes?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: "Picture path from upload-and-ocr" })
  picturePath?: string;

  @IsOptional()
  @IsObject()
  @ApiProperty({ required: false, description: "Updated OCR parsed data to save as metadata.ocr" })
  metadata?: Record<string, any>;
}
