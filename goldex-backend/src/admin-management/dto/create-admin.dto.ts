import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, MinLength, IsEnum, IsOptional, IsString, Matches } from "class-validator";
import { AdminRole } from "../../admin/role/admin.roles.enum";

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
}
