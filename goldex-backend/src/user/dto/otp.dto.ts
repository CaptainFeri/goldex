import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OtpDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'username', example: 'email@gmail.com' })
  username: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'otp sent', example: '123456' })
  otp: string;
}

export default OtpDto;
