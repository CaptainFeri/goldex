import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

export const LANGUAGES = ["fa", "en"] as const;
export const CALENDARS = ["jalali", "gregorian"] as const;
export const DISPLAY_CURRENCIES = ["TOMAN", "IRR"] as const;

/** Guards against a typo turning into an unreachable withdrawal floor. */
export const MAX_MIN_WITHDRAWAL_RIAL = 100_000_000_000;

export class AdminProfileDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) fullName: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiProperty({ nullable: true }) email: string | null;
  @ApiProperty({ nullable: true, description: "The admin's role name, for display." })
  roleName: string | null;
  @ApiProperty({ isArray: true, type: String }) permissions: string[];
  @ApiProperty({ nullable: true }) lastLoginAt: Date | null;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class SecuritySettingsDto {
  @ApiProperty() twoFactor: boolean;
  @ApiProperty() biometric: boolean;
  @ApiProperty() unknownLoginAlert: boolean;
}

export class UpdateSecuritySettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() twoFactor?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() biometric?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() unknownLoginAlert?: boolean;
}

export class NotificationSettingsDto {
  @ApiProperty() tradeAlerts: boolean;
  @ApiProperty() dailyEmailReport: boolean;
  @ApiProperty() systemAlerts: boolean;
}

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() tradeAlerts?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dailyEmailReport?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() systemAlerts?: boolean;
}

export class PlatformSettingsDto {
  @ApiProperty({ enum: DISPLAY_CURRENCIES }) displayCurrency: string;
  @ApiProperty({ enum: LANGUAGES }) language: string;
  @ApiProperty() timezone: string;
  @ApiProperty({ enum: CALENDARS }) calendar: string;
  @ApiProperty({ description: "Rial." }) minWithdrawal: string;
  @ApiProperty() defaultProfitPercent: string;
  @ApiProperty({ nullable: true }) updateAt: Date | null;
}

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({ enum: DISPLAY_CURRENCIES })
  @IsOptional()
  @IsIn(DISPLAY_CURRENCIES as unknown as string[])
  displayCurrency?: string;

  @ApiPropertyOptional({ enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES as unknown as string[])
  language?: string;

  @ApiPropertyOptional({ description: "An IANA zone name, validated against the runtime's own list." })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  timezone?: string;

  @ApiPropertyOptional({ enum: CALENDARS })
  @IsOptional()
  @IsIn(CALENDARS as unknown as string[])
  calendar?: string;

  @ApiPropertyOptional({ description: "Rial." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_MIN_WITHDRAWAL_RIAL)
  minWithdrawal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultProfitPercent?: number;
}
