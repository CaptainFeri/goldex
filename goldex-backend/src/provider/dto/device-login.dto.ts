import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

/**
 * These carry no device identifier.
 *
 * Which device is acting comes from the credential on the request. A device
 * that could name itself in a body could release a claim another device was
 * still waiting on.
 */
export class DeviceSendOtpDto {
  @ApiProperty({ example: '09123456789', description: 'The number registered with the provider' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^0[0-9]{10}$/, { message: 'PHONE.INVALID' })
  phone: string;
}

export class DeviceVerifyOtpDto {
  @ApiProperty({ example: '48213' })
  @IsString()
  @IsNotEmpty()
  @Length(4, 8)
  otp: string;
}

export class DeviceReleaseLoginDto {
  @ApiProperty({
    enum: ['success', 'failure'],
    description: 'A failure leaves the attempt counted, which is what the backoff measures from.',
  })
  @IsIn(['success', 'failure'])
  outcome: 'success' | 'failure';
}
