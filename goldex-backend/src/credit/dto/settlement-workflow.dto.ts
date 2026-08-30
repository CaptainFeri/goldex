import { IsUUID, IsOptional, IsNumber, IsString, Min, IsBoolean, IsArray, IsEnum, ValidateIf } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SettlementMethodEnum } from "../enum/settlement-workflow-status.enum";

export class RequestSettlementDto {
  @ApiPropertyOptional({ description: "Credit trade (credit_order id) to settle. Omit to settle the whole facility." })
  @IsOptional()
  @IsUUID()
  creditOrderId?: string;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SelectSettlementMethodDto {
  @ApiProperty({ enum: SettlementMethodEnum, description: "Settlement method chosen by the user (must be admin-enabled)" })
  @IsEnum(SettlementMethodEnum)
  method: SettlementMethodEnum;
}

export class FundSettlementDto {
  @ApiProperty({ description: "Amount funded toward the settlement shortfall" })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApproveSettlementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectSettlementDto {
  @ApiProperty()
  @IsString()
  reason: string;
}

export class FailSettlementDto {
  @ApiProperty()
  @IsString()
  reason: string;
}

export class SettlementPolicyDto {
  @ApiPropertyOptional({ description: "REQUIRE_ADMIN_APPROVAL_FOR_SETTLEMENT ON/OFF" })
  @IsOptional()
  @IsBoolean()
  requireAdminApprovalForSettlement?: boolean;

  @ApiPropertyOptional({ description: "Enabled settlement methods (FULL/NET/TOPUP)" })
  @IsOptional()
  @IsArray()
  @IsEnum(SettlementMethodEnum, { each: true })
  settlementMethods?: SettlementMethodEnum[];

  @ApiPropertyOptional({ description: "Allow netting of offsetting trades (Method B)" })
  @IsOptional()
  @IsBoolean()
  nettingEnabled?: boolean;
}