import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from "class-validator";

/** The largest credit a role may grant, from the panels' MAX_CREDIT_AMOUNT. */
export const MAX_CREDIT_AMOUNT = 10_000_000;

export class PermissionDto {
  @ApiProperty({ example: "withdrawals_approve" })
  key: string;

  @ApiProperty({ example: "تأیید برداشت" })
  label: string;
}

/**
 * What the server will actually allow on this role, for this caller.
 *
 * Sent so the client greys out the right buttons instead of reimplementing the
 * rules — and so that when it does allow something, the request succeeds.
 */
export class RoleCapabilitiesDto {
  @ApiProperty({ example: false })
  canDelete: boolean;

  @ApiProperty({ example: false, description: "Fixed roles cannot be renamed; code keys off the slug" })
  canRename: boolean;

  @ApiProperty({ example: true, description: "False for the root role, which always holds everything" })
  canEditPermissions: boolean;

  @ApiProperty({ example: true })
  canEditConfig: boolean;
}

export class AdminRoleDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "finance" })
  slug: string;

  @ApiProperty({ example: "مالی" })
  roleName: string;

  @ApiProperty({ example: true, description: "Migrated from the legacy enum" })
  isFixed: boolean;

  @ApiProperty({ type: [String], example: ["crypto", "rial"] })
  wallets: string[];

  @ApiProperty({ type: [String], example: ["crypto-rial"] })
  pairs: string[];

  @ApiProperty({ description: "Per-wallet fees, ceilings and credit", example: { rial: { buyFee: "0.125" } } })
  configs: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true, example: "10000000" })
  maxCredit?: string | null;

  @ApiProperty({ type: [String], description: "Catalog keys this role holds" })
  permissions: string[];

  @ApiProperty({ example: 3, description: "Admins currently assigned" })
  memberCount: number;

  @ApiProperty({ type: RoleCapabilitiesDto })
  capabilities: RoleCapabilitiesDto;

  @ApiProperty()
  createAt: Date;
}

export class RoleStatsDto {
  @ApiProperty({ example: 6 })
  total: number;

  @ApiProperty({ example: 14, description: "Admins across all roles" })
  totalMembers: number;

  @ApiProperty({ example: 4, description: "Roles migrated from the legacy enum" })
  fixed: number;

  @ApiProperty({ example: 2, description: "Roles with nobody assigned" })
  empty: number;
}

export class RoleMemberDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  email?: string | null;

  @ApiProperty({ example: false })
  isSuspended: boolean;

  @ApiPropertyOptional({ nullable: true })
  lastLoginAt?: Date | null;
}

/**
 * Move admins into a role.
 *
 * An admin belongs to exactly one role, so this replaces whatever role they
 * were in. There is no counterpart that takes an admin *out* of a role: an
 * admin with none holds no permissions at all, and taking access away
 * deliberately is what suspension is for.
 */
export class AssignMembersDto {
  @ApiProperty({
    type: [String],
    format: "uuid",
    description: "Admin ids to move into this role. Unknown ids fail the whole request.",
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID("4", { each: true })
  adminIds: string[];
}

export class CreateRoleDto {
  @ApiProperty({ example: "مدیر مالی" })
  @IsString()
  @Length(1, 120)
  roleName: string;

  @ApiPropertyOptional({ example: "10000000", description: `At most ${MAX_CREDIT_AMOUNT}` })
  @IsOptional()
  @IsNumberString()
  maxCredit?: string;

  @ApiPropertyOptional({ type: [String], example: ["crypto", "fiat", "metal", "rial"] })
  @IsOptional()
  @IsArray()
  wallets?: string[];

  @ApiPropertyOptional({
    description: "Per-wallet config, keyed by a wallet in `wallets`",
    example: { crypto: { buyFee: "0.125", sellFee: "0.150", withdrawal: "50000000", hasCredit: "yes", creditAmount: "5000000" } },
  })
  @IsOptional()
  @IsObject()
  configs?: Record<string, any>;

  @ApiPropertyOptional({
    type: [String],
    example: ["crypto-fiat"],
    description: "Sorted `<walletA>-<walletB>` ids; must be a subset of `wallets`",
  })
  @IsOptional()
  @IsArray()
  pairs?: string[];

  @ApiPropertyOptional({ type: [String], description: "Catalog keys; cannot exceed the caller's own set" })
  @IsOptional()
  @IsArray()
  permissions?: string[];
}

export class UpdateRoleDto extends CreateRoleDto {
  @ApiPropertyOptional({ example: "مدیر مالی", description: "Rejected for a fixed role" })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  declare roleName: string;
}

export class SetPermissionsDto {
  @ApiProperty({ type: [String], example: ["dashboard", "reports"] })
  @IsArray()
  @Type(() => String)
  permissions: string[];
}
