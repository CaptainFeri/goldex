import { ApiProperty } from "@nestjs/swagger";

export class AdminUserCountByRoleDto {
  @ApiProperty({ example: 12480 })
  customer: number;

  @ApiProperty({ example: 64 })
  partner: number;

  @ApiProperty({ example: 210, description: "Registered but not yet completed onboarding" })
  newUser: number;

  @ApiProperty({ example: 8 })
  admin: number;
}

/**
 * The user KPI tiles.
 *
 * `active`, `blocked` and `expired` partition the population: a blocked user is
 * never also counted as expired, and `inactive` is the sum of the two.
 */
export class AdminUserStatsDto {
  @ApiProperty({ example: 12840 })
  total: number;

  @ApiProperty({ type: AdminUserCountByRoleDto })
  byRole: AdminUserCountByRoleDto;

  @ApiProperty({ example: 12100, description: "Neither blocked nor past their access expiry" })
  active: number;

  @ApiProperty({ example: 740, description: "blocked + expired" })
  inactive: number;

  @ApiProperty({ example: 320 })
  blocked: number;

  @ApiProperty({ example: 420, description: "Past `activeUntil`, but not blocked" })
  expired: number;

  @ApiProperty({ example: 1248, description: "Live count from Redis; 0 if Redis is unreachable" })
  online: number;

  @ApiProperty({ example: 9800 })
  verifiedKyc: number;

  @ApiProperty({ example: 12 })
  pendingKyc: number;

  @ApiProperty({
    example: 340,
    description: "Registrations in the requested window; the total when no window is given",
  })
  newUsers: number;
}
