import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CashoutSourceEnum } from "../enum/cashout-source.enum";

export class CashoutCreditDto {
  @ApiProperty({ description: "Credit trade (credit_order id) to cash out" })
  @IsUUID()
  creditOrderId: string;

  @ApiProperty({
    enum: CashoutSourceEnum,
    description: "Where the purchase amount is taken from: the deposit wallet or the frozen collateral",
  })
  @IsEnum(CashoutSourceEnum)
  source: CashoutSourceEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
