import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CountryDTO {
  @ApiProperty({ example: 103 })
  id: number;

  @ApiPropertyOptional({ example: "IRN" })
  isoCode: string;

  @ApiPropertyOptional({ example: "IR" })
  isoCode2: string;

  @ApiPropertyOptional({ example: "Iran" })
  primaryName: string;

  @ApiPropertyOptional({ example: "Asia" })
  region: string;

  @ApiPropertyOptional({ example: "ایران" })
  secondaryName: string;
}

/** A user's profile, as the admin detail view reads it. */
export class AdminUserprofileDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({ example: "علی" })
  firstname: string;

  @ApiPropertyOptional({ example: "رضایی" })
  lastname: string;

  @ApiPropertyOptional({ example: "user@mail.ir" })
  email: string;

  @ApiPropertyOptional({ example: "09121234567" })
  cellPhone: string;

  @ApiPropertyOptional({ example: "MALE", description: "Resolved from the numeric gender enum" })
  gender: string;

  @ApiPropertyOptional({ type: CountryDTO, nullable: true, description: "Null when the profile has no country set" })
  country: CountryDTO;

  @ApiPropertyOptional({ example: "تهران، خیابان ولیعصر" })
  address: string;

  @ApiPropertyOptional({ example: "1234567890" })
  postalCode: string;

  @ApiPropertyOptional({ nullable: true })
  avatarImgPath: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "/api/v1/files/signed/eyJvIjoiYXZhdGFyLTNmOWExYzRkLTIwMjYtMDktMDUuanBnIn0.KT6JbmTEN",
    description:
      "Short-lived URL serving the avatar, or null when there is none. Null also for a legacy " +
      "on-disk avatar, where `avatarImgPath` starts with `edited-` and is served from /uploads.",
  })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Non-null means two-factor is active" })
  twoFactorActivatedAt: Date;

  @ApiPropertyOptional()
  createdAt: Date;

  @ApiPropertyOptional()
  updatedAt: Date;
}
