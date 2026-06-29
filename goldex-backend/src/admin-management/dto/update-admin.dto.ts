import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsEmail, IsOptional, MinLength, IsEnum } from "class-validator";
import { CreateAdminDto } from "./create-admin.dto";
import { AdminRole } from "../../admin/role/admin.roles.enum";

export class UpdateAdminDto extends PartialType(CreateAdminDto) {
  @IsEmail()
  @IsOptional()
  @ApiPropertyOptional()
  email?: string;

  @IsOptional()
  @MinLength(6)
  @ApiPropertyOptional()
  password?: string;

  @IsEnum(AdminRole)
  @IsOptional()
  @ApiPropertyOptional()
  role?: AdminRole;
}
