import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({
    description: 'Provider phone number ',
    example: '09122650904',
  })
  @IsNotEmpty()
  @IsString()
  phone!: string;
}
