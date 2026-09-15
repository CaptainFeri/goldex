import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

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

  @ApiProperty({
    required: false,
    example: 'no code arrived',
    description:
      'What went wrong, in the handset\'s own words. Kept with the attempt, because the record ' +
      'of an unattended failure is the only account anyone will have of it.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  reason?: string;
}
