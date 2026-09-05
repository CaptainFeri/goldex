import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from "class-validator";
import { SymbolTypeEnum } from "../enum/symbol.type.enum";

export class CreateSymbolDto {
  @IsString()
  @ApiProperty({ example: "Toman" })
  name: string;

  @IsString()
  @ApiProperty({ example: "IRR" })
  slug: string;

  @IsEnum(SymbolTypeEnum)
  @ApiProperty({ enum: SymbolTypeEnum })
  symbolType: SymbolTypeEnum;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  hasPaymentGateway?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  depositTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  withdrawTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  depositGateways?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  withdrawGateways?: string[];

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  defaultDepositGateway?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  defaultWithdrawGateway?: string;
}

export class UpdateSymbolDto extends PartialType(CreateSymbolDto) {}
