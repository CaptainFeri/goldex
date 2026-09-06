import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, MinLength, IsEnum, IsOptional, IsString, IsUUID, Matches, IsArray, ValidateNested, IsNumber, Min, Max } from "class-validator";
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

  @IsNotEmpty()
  @MinLength(6)
  @ApiProperty({ description: "Admin login password (verified in step 1 of login, before OTP)" })
  password: string;

  @IsOptional()
  @IsEnum(AdminRole)
  @ApiPropertyOptional({
    enum: AdminRole,
    description:
      "One of the four migrated roles. Ignored when `roleId` is given, which is the only way " +
      "to place an admin in a custom role. One of the two is required.",
  })
  role?: AdminRole;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The data-driven role this admin's permissions come from, from `GET /admin/roles`. " +
      "Wins over `role`. Omitted, the role matching `role`'s slug is used — an admin with no " +
      "role holds no permissions at all, so one is always assigned.",
  })
  roleId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleEntry)
  @ApiPropertyOptional({ description: "Work schedule entries (auto-created for FINANCE role with defaults if omitted)", type: [ScheduleEntry] })
  schedules?: ScheduleEntry[];
}
