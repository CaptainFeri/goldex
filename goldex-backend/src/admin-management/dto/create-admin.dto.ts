import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, MinLength, IsEnum, IsOptional, IsString, Matches, IsArray, ValidateNested, IsNumber, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { AdminRole } from "../../admin/role/admin.roles.enum";

class ScheduleEntry {
  @IsNumber()
  @Min(0)
  @Max(6)
  @ApiProperty({ description: "Day of week (0=Sunday … 6=Saturday)" })
  dayOfWeek: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: "Saturday" })
  dayLabel: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{2}:\d{2}$/)
  @ApiProperty({ example: "09:00" })
  startTime: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{2}:\d{2}$/)
  @ApiProperty({ example: "18:00" })
  endTime: string;
}

export class CreateAdminDto {
  // Mobile is now the primary admin identity (used for OTP login).
  @IsString()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: "PHONE.INVALID" })
  @ApiProperty({ example: "09123456789" })
  phone: string;

  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional()
  email?: string;

  @IsOptional()
  @MinLength(6)
  @ApiPropertyOptional({ description: "Optional — admins log in via OTP, not password" })
  password?: string;

  @IsEnum(AdminRole)
  @ApiProperty({ enum: AdminRole })
  role: AdminRole;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleEntry)
  @ApiPropertyOptional({ description: "Work schedule entries (auto-created for FINANCE role with defaults if omitted)", type: [ScheduleEntry] })
  schedules?: ScheduleEntry[];
}
