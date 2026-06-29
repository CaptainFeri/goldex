// dto/freeze-wallet.dto.ts
import { IsUUID, IsEnum, IsNumber, IsOptional, IsString, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { FreezeActionEnum } from "../enum/freeze-action.enum";

export class FreezeWalletDto {
  @ApiProperty()
  @IsUUID()
  walletId: string;

  @ApiProperty({ enum: FreezeActionEnum })
  @IsEnum(FreezeActionEnum)
  action: FreezeActionEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
