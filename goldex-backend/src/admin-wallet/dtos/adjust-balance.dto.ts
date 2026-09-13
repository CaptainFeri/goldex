// dto/adjust-balance.dto.ts
import { IsUUID, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { OperationVoucherDto } from "./operation-voucher.dto";
import { BalanceAdjustTypeEnum } from "../enum/balance-adjust-type.enum";

export class AdjustBalanceDto {
  @ApiProperty()
  @IsUUID()
  walletId: string;

  @ApiProperty({ enum: BalanceAdjustTypeEnum })
  @IsEnum(BalanceAdjustTypeEnum)
  adjustType: BalanceAdjustTypeEnum;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: any;

  /**
   * Required for INCREASE_FREE and DECREASE_FREE, which change what the user
   * holds — the service rejects those without it. Locking and unlocking move
   * value between buckets of the same wallet and are neither a deposit nor a
   * withdrawal, so a voucher there is accepted but not demanded.
   */
  @ApiPropertyOptional({ type: OperationVoucherDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OperationVoucherDto)
  voucher?: OperationVoucherDto;
}
