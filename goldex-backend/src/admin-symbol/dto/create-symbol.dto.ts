import { IsString, IsNumber, IsEnum, IsBoolean, IsOptional } from "class-validator";
import { GainTypeEnum } from "../enum/gain.type.enum";
import { SymbolTypeEnum } from "../enum/symbol.type.enum";
import { UnitTypeEnum } from "../enum/unit.type.enum";
import { PaymentGatewayEnum } from "../enum/payment.gateway.enum";
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

  @IsEnum(PaymentGatewayEnum)
  @ApiProperty()
  paymentGateWayType: PaymentGatewayEnum;

  @IsBoolean()
  @ApiProperty()
  hasPaymentGateway: boolean;

  @IsBoolean()
  @ApiProperty()
  isActive: boolean;
}
