import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AdminRole } from "../../admin/role/admin.roles.enum";

/**
 * An admin account as the management API returns it.
 *
 * `hashPassword` is stripped in the controller and must never be added here —
 * this DTO is the contract, and a field listed in it is a field someone will
 * eventually populate.
 */
export class AdminAccountDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({
    example: "09121234567",
    nullable: true,
    description: "The login identity — admins authenticate by mobile and OTP",
  })
  phone?: string | null;

  @ApiPropertyOptional({
    example: "admin@goldex.ir",
    nullable: true,
    description: "Identification only; legacy, not a login credential",
  })
  email?: string | null;

  @ApiProperty({ enum: AdminRole, example: AdminRole.ADMIN })
  role: AdminRole;

  @ApiProperty({ example: false, description: "Suspended admins keep their record but cannot sign in" })
  isSuspended: boolean;

  @ApiPropertyOptional({ nullable: true, example: "2026-07-15T09:12:00.000Z" })
  suspendedAt?: Date | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Who suspended them" })
  suspendedBy?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "2026-07-15T09:12:00.000Z" })
  lastLoginAt?: Date | null;

  @ApiProperty({ example: "2026-07-15T09:12:00.000Z" })
  createAt: Date;

  @ApiProperty({ example: "2026-07-15T09:12:00.000Z" })
  updateAt: Date;
}
