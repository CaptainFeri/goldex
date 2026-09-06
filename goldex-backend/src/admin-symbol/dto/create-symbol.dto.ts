import { IsString, IsNumber, IsEnum, IsBoolean, IsOptional, IsArray, ArrayMinSize, Matches } from "class-validator";
import { GainTypeEnum } from "../enum/gain.type.enum";
import { MarketTypeEnum } from "../../admin-pair/enum/market.type.enum";
import { SymbolTypeEnum } from "../enum/symbol.type.enum";
import { UnitTypeEnum } from "../enum/unit.type.enum";
import { DepositTypeEnum } from "../enum/deposit-type.enum";
import { WithdrawTypeEnum } from "../enum/withdraw-type.enum";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateSymbolDto {
  @IsString()
  @ApiProperty()
  name: string;

  @IsString()
  @ApiProperty()
  slug: string;

  @IsString()
  @ApiProperty()
  picPath: string;

  @IsNumber()
  @ApiProperty()
  gain: number;

  @IsEnum(GainTypeEnum)
  @ApiProperty()
  gainType: GainTypeEnum;

  @IsEnum(SymbolTypeEnum)
  @ApiProperty()
  symbolType: SymbolTypeEnum;

  @IsEnum(UnitTypeEnum)
  @ApiProperty()
  unitType: UnitTypeEnum;

  @IsEnum(MarketTypeEnum)
  @ApiProperty({ enum: MarketTypeEnum })
  marketType: MarketTypeEnum;

  @IsBoolean()
  @ApiProperty()
  hasPaymentGateway: boolean;

  @IsBoolean()
  @ApiProperty()
  isActive: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(DepositTypeEnum, { each: true })
  @ArrayMinSize(1)
  @ApiProperty({ enum: DepositTypeEnum, isArray: true, required: false })
  depositTypes?: DepositTypeEnum[];

  @IsOptional()
  @IsArray()
  @IsEnum(WithdrawTypeEnum, { each: true })
  @ArrayMinSize(1)
  @ApiProperty({ enum: WithdrawTypeEnum, isArray: true, required: false })
  withdrawTypes?: WithdrawTypeEnum[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ isArray: true, required: false, description: "Gateway provider codes selectable for deposits" })
  depositGateways?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ isArray: true, required: false, description: "Gateway provider codes selectable for withdrawals" })
  withdrawGateways?: string[];

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  defaultDepositGateway?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  defaultWithdrawGateway?: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "usdToman",
    description:
      "The camelCase key a panel keys its ticker off. Unique across symbols where set.",
  })
  @IsOptional()
  @IsString()
  tickerKey?: string;

  @ApiPropertyOptional({ example: false, description: "Show this symbol in the market ticker" })
  @IsOptional()
  @IsBoolean()
  isTicker?: boolean;

  @ApiPropertyOptional({ example: 20, description: "Ascending order within the ticker" })
  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @ApiPropertyOptional({
    nullable: true,
    example: "ارز",
    description: "Grouping for the price screen: طلا / سکه / نقره / ارز / کریپتو / کالا",
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "#d4af37",
    description:
      "Chart colour on the price screen, as a CSS hex string. Left unset, the price endpoints " +
      "derive a stable hue from the slug — so this is a preference, not a requirement.",
  })
  @IsOptional()
  @IsString()
  @Matches(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: "color must be a CSS hex colour, e.g. #d4af37",
  })
  color?: string;
}
