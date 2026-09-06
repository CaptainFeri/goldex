import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsEmail, IsOptional, MinLength, IsEnum, IsUUID } from "class-validator";
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
  @ApiPropertyOptional({ enum: AdminRole, description: "Ignored when `roleId` is given" })
  role?: AdminRole;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({
    format: "uuid",
    description: "Move the admin into this role. The only way to reach a custom role.",
  })
  roleId?: string;
}
