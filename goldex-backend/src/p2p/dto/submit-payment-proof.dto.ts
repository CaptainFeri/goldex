import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class SubmitPaymentProofDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ApiProperty()
  amount: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  sourceAccount?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  destinationAccount?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  trackingCode?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ required: false })
  paidAt?: string;
}
