import { IsString, IsNumber, IsOptional, IsObject, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { P2pConstraintsDto, P2pSplitDto } from "../../p2p/dto/create-p2p-withdraw.dto";

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

  @IsOptional()
  @ValidateNested()
  @Type(() => P2pSplitDto)
  @ApiProperty({ required: false, type: P2pSplitDto, description: "How to split the request (type=p2p)" })
  split?: P2pSplitDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => P2pConstraintsDto)
  @ApiProperty({ required: false, type: P2pConstraintsDto, description: "Matching constraints (type=p2p)" })
  constraints?: P2pConstraintsDto;
}
