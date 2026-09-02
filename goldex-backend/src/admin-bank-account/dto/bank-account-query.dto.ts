import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from "class-validator";
import {
  AdminBankAccountStatusEnum,
  BankAccountDirectionEnum,
} from "../enum/admin-bank-account-status.enum";

export class BankAccountQueryDto {
  @IsOptional()
  @IsEnum(BankAccountDirectionEnum)
  @ApiProperty({ required: false, enum: BankAccountDirectionEnum })
  direction?: BankAccountDirectionEnum;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ required: false })
  symbolId?: string;

  @IsOptional()
  @IsEnum(AdminBankAccountStatusEnum)
  @ApiProperty({ required: false, enum: AdminBankAccountStatusEnum })
  status?: AdminBankAccountStatusEnum;

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
