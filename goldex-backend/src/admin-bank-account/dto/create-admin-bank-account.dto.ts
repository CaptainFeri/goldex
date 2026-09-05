import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIBAN,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class CreateAdminBankAccountDto {
  @IsString()
  @ApiProperty({ example: "ملت — حساب اصلی" })
  title: string;

  @IsString()
  @ApiProperty()
  bankName: string;

  @IsString()
  @ApiProperty({ description: "Must match the IBAN/card inquiry result" })
  ownerName: string;

  @IsUUID()
  @ApiProperty({ description: "Symbol this account settles (rial only for now)" })
  symbolId: string;

  @IsOptional()
  @IsIBAN()
  @ApiProperty({ required: false })
  iban?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  cardNumber?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, description: "Offer as a destination to depositors" })
  useForDeposit?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, description: "Use as the source for admin payouts" })
  useForWithdraw?: boolean;

  @IsOptional()
  @IsInt()
  @ApiProperty({ required: false, description: "Lower is tried first" })
  priority?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({ required: false, description: "0 or omitted = unlimited" })
  depositDailyLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({ required: false })
  depositPerTxLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({ required: false })
  withdrawDailyLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({ required: false })
  withdrawPerTxLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  @ApiProperty({ required: false, description: "Omit both for a 24h account" })
  activeFromHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  @ApiProperty({ required: false })
  activeToHour?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  notes?: string;
}
