import { ApiProperty } from '@nestjs/swagger';

export class VerifyTokenDTO {
  @ApiProperty({ description: 'token', example: '123456' })
  token: string;
}
