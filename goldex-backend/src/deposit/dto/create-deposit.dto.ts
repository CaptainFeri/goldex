import { IsString, IsNumber, IsOptional, IsObject } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateDepositDto {
  @IsString()
  @ApiProperty()
  symbolId: string;

  @IsString()
  @ApiProperty()
  type: string;

  @IsNumber()
  @ApiProperty()
  amount: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  notes?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  picturePath?: string;

  @IsOptional()
  @IsObject()
  @ApiProperty({ required: false })
  metadata?: Record<string, any>;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: "Gateway provider code for payment-gateway deposits" })
  gatewayCode?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: "Warehouse ID (required when type=warehouse)" })
  warehouseId?: string;
}
