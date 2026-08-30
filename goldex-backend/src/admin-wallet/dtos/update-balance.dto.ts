// dto/update-balance.dto.ts
import { IsUUID, IsEnum, IsNumber, IsOptional, IsString, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { BalanceActionTypeEnum } from "../enum/balance-action-type.enum";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";

export class UpdateBalanceDto {
  @ApiProperty()
  @IsUUID()
  walletId: string;

  @ApiProperty({ enum: BalanceActionTypeEnum })
  @IsEnum(BalanceActionTypeEnum)
  actionType: BalanceActionTypeEnum;

  @ApiProperty({ enum: TransactionTypeEnum })
  @IsEnum(TransactionTypeEnum)
  transactionType: TransactionTypeEnum;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: any;
}
