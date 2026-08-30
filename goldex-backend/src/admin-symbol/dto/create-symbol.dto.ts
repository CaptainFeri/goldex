import { IsString, IsNumber, IsEnum, IsBoolean, IsOptional, IsArray, ArrayMinSize } from "class-validator";
import { GainTypeEnum } from "../enum/gain.type.enum";
import { MarketTypeEnum } from "../../admin-pair/enum/market.type.enum";
import { SymbolTypeEnum } from "../enum/symbol.type.enum";
import { UnitTypeEnum } from "../enum/unit.type.enum";
import { PaymentGatewayEnum } from "../enum/payment.gateway.enum";
import { DepositTypeEnum } from "../enum/deposit-type.enum";
import { WithdrawTypeEnum } from "../enum/withdraw-type.enum";
import { ApiProperty } from "@nestjs/swagger";

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

  @IsOptional()
  @IsEnum(PaymentGatewayEnum)
  @ApiProperty({ enum: PaymentGatewayEnum, required: false })
  paymentGateWayType?: PaymentGatewayEnum;

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
}
