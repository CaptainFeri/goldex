import { ApiProperty } from '@nestjs/swagger';

export class UpdateRefreshTokenDto {
  @ApiProperty()
  refreshToken: string;
}
