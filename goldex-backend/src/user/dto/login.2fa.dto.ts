import { ApiProperty } from '@nestjs/swagger';

export class login2faDto {
  @ApiProperty({ description: 'userId', example: 'string uuid' })
  userId: string;
  @ApiProperty({ description: 'google authenticator code', example: '123456' })
  code: string;
}
