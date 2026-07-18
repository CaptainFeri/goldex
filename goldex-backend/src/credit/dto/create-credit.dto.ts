import { IsUUID, IsNumber, IsBoolean, IsOptional, IsString, Min, Max, IsDateString, ValidateNested, ArrayMinSize } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class FrozenWalletDto {
  @ApiProperty()
  @IsUUID()
  walletId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;
}

export class CreateCreditDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  hasCallMargin?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  callMarginPercent?: number;

  @ApiProperty({ required: false, default: 24 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  reminderTimerHours?: number;

  @ApiProperty()
  @IsDateString()
  expireAt: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, type: [FrozenWalletDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FrozenWalletDto)
  frozenWallets?: FrozenWalletDto[];
}
