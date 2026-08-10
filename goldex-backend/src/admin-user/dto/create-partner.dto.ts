import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsEmail, IsEnum, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from "class-validator";
import { UserRoleEnum } from "../../shared/enum/user.role.enum";
import { MarketTypeEnum } from "../../admin-pair/enum/market.type.enum";
import { MarketKindEnum } from "../../admin-pair/enum/market.kind.enum";

export class CreatePartnerDto {
  @ApiProperty({ example: "09123456789" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: "PHONE.INVALID" })
  phone: string;

  @ApiPropertyOptional()
  @IsString()
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: "Activation expiry (ISO date). Null = no expiry." })
  @IsOptional()
  @IsISO8601()
  activeUntil?: string;

  @ApiPropertyOptional({ enum: UserRoleEnum, default: UserRoleEnum.PARTNER, description: "User role (default: PARTNER)" })
  @IsOptional()
  @IsNumber()
  role?: number;

  @ApiPropertyOptional({ enum: MarketTypeEnum, isArray: true, description: "Market types this user can see (e.g. ['formal', 'informal'])" })
  @IsOptional()
  @IsArray()
  @IsEnum(MarketTypeEnum, { each: true })
  marketTypes?: MarketTypeEnum[];

  @ApiPropertyOptional({ enum: MarketKindEnum, isArray: true, description: "Trading market kinds this user can use (e.g. ['MARKET', 'LIMIT', 'OFFER'])" })
  @IsOptional()
  @IsArray()
  @IsEnum(MarketKindEnum, { each: true })
  marketKinds?: MarketKindEnum[];
}
