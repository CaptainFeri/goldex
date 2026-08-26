import { IsUUID, IsOptional, IsNumber, IsString, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class RequestSettlementDto {
  @ApiProperty({ required: false, description: "Credit trade (credit_order id) to settle. Omit to settle the whole facility." })
  @IsOptional()
  @IsUUID()
  creditOrderId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReceiveSettlementAssetDto {
  @ApiProperty({ description: "Amount of the required asset delivered to the settlement inventory" })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class FailSettlementDto {
  @ApiProperty()
  @IsString()
  reason: string;
}