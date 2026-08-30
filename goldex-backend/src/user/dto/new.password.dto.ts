import { ApiProperty } from '@nestjs/swagger';

export class NewPasswordDto {
  @ApiProperty({ type: 'string' })
  newPassword: string;
}
