import { ApiProperty } from '@nestjs/swagger';

export class UpdatePasswordDTO {
  @ApiProperty({ description: 'current password of user', example: '' })
  currentPassword: string;
  @ApiProperty({ description: 'new Strong Password from user', example: '' })
  newPassword: string;
}
