import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";
import { Type } from "class-transformer";
import { SettlementDirection } from "../entity/provider-settlement.entity";

export class SettleDto {
  @ApiProperty({ example: "mock-zaryar-a" })
  @IsString()
  @IsNotEmpty()
  providerKey: string;

  @ApiProperty({ example: "XAU" })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ enum: SettlementDirection, description: "RECEIVE = take asset from provider, PAY = give asset to provider" })
  @IsEnum(SettlementDirection)
  direction: SettlementDirection;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
