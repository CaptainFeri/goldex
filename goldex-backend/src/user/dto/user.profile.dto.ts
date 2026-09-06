import { ApiPropertyOptional } from '@nestjs/swagger';
import { CountryEntity } from '../../baseinfo/entity/country.entity';

export class UserProfileDto {
  id: string;
  gender: string;
  country: CountryEntity;
  address: string;
  postalCode: string;
  avatarImgPath: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "/api/v1/files/signed/eyJvIjoiYXZhdGFyLTNmOWExYzRkLTIwMjYtMDktMDUuanBnIn0.KT6JbmTEN",
    description:
      "Short-lived URL serving the avatar, or null when there is none. Null also for a legacy " +
      "on-disk avatar, where `avatarImgPath` starts with `edited-` and is served from /uploads.",
  })
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
