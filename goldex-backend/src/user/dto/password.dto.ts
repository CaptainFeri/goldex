import { ApiProperty } from '@nestjs/swagger';

export class PasswordDTO {
  @ApiProperty({ description: 'new password', example: '123456' })
  newPassword: string;
}
