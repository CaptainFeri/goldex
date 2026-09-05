import { IsUUID, IsNumber, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class RequestCreditDto {
  @ApiProperty({ description: "DEPOSIT wallet to freeze the collateral from" })
  @IsUUID()
  depositWalletId: string;

  @ApiProperty({ description: "Collateral amount in the wallet's symbol" })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @ApiProperty({ description: "Leverage multiplier (≤ level creditMaxLeverage)" })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  leverage: number;
}
