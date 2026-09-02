import { IsString, IsNumber, IsOptional, IsObject, IsEnum } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { DepositTypeEnum } from "../../admin-symbol/enum/deposit-type.enum";

export class CreateDepositDto {
  @IsString()
  @ApiProperty()
  symbolId: string;

  @IsEnum(DepositTypeEnum)
  @ApiProperty({ enum: DepositTypeEnum })
  type: DepositTypeEnum;

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

  @IsOptional()
  @IsString()
  @ApiProperty({
    required: false,
    description: "Source IBAN the transfer will be made from (required when type=p2p)",
  })
  iban?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: "Bank name for the IBAN above (optional)" })
  bankName?: string;
}
