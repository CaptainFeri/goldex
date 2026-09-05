import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRoleEnum } from "../../shared/enum/user.role.enum";

/** A row in the paginated admin user list. */
export class AdminUserListItemDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({ example: "علی" })
  firstName?: string;

  @ApiPropertyOptional({ example: "رضایی" })
  lastName?: string;

  @ApiPropertyOptional({ example: "user@mail.ir" })
  email?: string;

  @ApiPropertyOptional({ example: "09121234567" })
  phone?: string;

  @ApiProperty({
    enum: UserRoleEnum,
    example: UserRoleEnum.CUSTOMER,
    description: "Numeric: 0 CUSTOMER, 1 ADMIN, 2 NEW_USER, 3 PARTNER",
  })
  role: UserRoleEnum;

  @ApiPropertyOptional({
    nullable: true,
    description: "Access expiry; a past date means inactive without being blocked",
  })
  activeUntil?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  registeredAt?: Date | null;

  @ApiPropertyOptional({ nullable: true, description: "Non-null means blocked" })
  blockedAt?: Date | null;

  @ApiProperty()
  createAt: Date;

  @ApiPropertyOptional({ description: "Only the avatar is joined from the profile" })
  profile?: { avatarImgPath?: string };
}

/** What `PATCH users/:id/role` returns after a role change. */
export class UserRoleChangeDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ enum: UserRoleEnum, example: UserRoleEnum.PARTNER })
  role: UserRoleEnum;

  @ApiProperty({
    type: [String],
    example: ["formal", "informal"],
    description: "Market types after the change — a partner may see both",
  })
  marketTypes: string[];

  @ApiProperty({ type: [String], example: ["MARKET", "LIMIT"] })
  marketKinds: string[];
}
