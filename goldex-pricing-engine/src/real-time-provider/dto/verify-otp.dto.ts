import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    description: 'OTP code received via SMS',
    example: '123456',
    minLength: 4,
    maxLength: 8,
  })
  @IsNotEmpty()
  @IsString()
  @Length(4, 8)
  @Matches(/^\d+$/, { message: 'OTP must contain only digits' })
  otp!: string;
}
