import { ApiProperty } from '@nestjs/swagger';

export class FollowDto {
  @ApiProperty({ description: 'user want follow ID', example: 'uuid' })
  friendId: number;
}
