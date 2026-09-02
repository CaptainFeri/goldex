import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Min } from "class-validator";
import { P2pWithdrawStateEnum } from "../enum/p2p.enums";

export class AdminWithdrawQueryDto {
  @IsOptional()
  @IsEnum(P2pWithdrawStateEnum)
  @ApiProperty({ required: false, enum: P2pWithdrawStateEnum })
  state?: P2pWithdrawStateEnum;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ required: false })
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @ApiProperty({ required: false })
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ required: false, default: 1 })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ required: false, default: 20 })
  limit?: number;
}
