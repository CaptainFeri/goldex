import { IsString, IsNumber, IsOptional, IsObject } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateWithdrawDto {
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
  @ApiProperty({ required: false, description: "Gateway provider code for auto withdrawals" })
  gatewayCode?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: "Beneficiary IBAN (required for gateway withdrawals)" })
  beneficiaryIban?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: "Beneficiary name (required for gateway withdrawals)" })
  beneficiaryName?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: "Beneficiary id (required for gateway withdrawals)" })
  beneficiaryId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: "Preferred warehouse ID (optional when type=warehouse)" })
  warehouseId?: string;
}
