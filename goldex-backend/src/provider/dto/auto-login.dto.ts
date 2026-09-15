import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Which device is asking.
 *
 * Not a credential — the admin token is what authorises the call. This says
 * which handset holds the attempt, so a second one is told who has it and a
 * release can be refused to anyone else.
 */
export class ClaimLoginDto {
  @ApiProperty({ example: 'pixel-desk-1', description: 'Stable identifier for the handset' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceId: string;
}

export class ReleaseLoginDto extends ClaimLoginDto {
  @ApiProperty({
    enum: ['success', 'failure'],
    description:
      'Whether the provider was logged back in. A failure leaves the attempt counted, which is ' +
      'what the backoff is measured from.',
  })
  @IsIn(['success', 'failure'])
  outcome: 'success' | 'failure';
}

export class LoginCandidateDto {
  @ApiProperty({ nullable: true, format: 'uuid' })
  id: string | null;

  @ApiProperty({ example: 'zaryar' })
  key: string;

  @ApiProperty({ nullable: true, example: 'زریار' })
  persianName?: string | null;

  @ApiProperty({ nullable: true, example: '09123456789' })
  phone?: string | null;

  @ApiProperty({ example: 'auth_expired' })
  status: string;

  @ApiProperty({ description: 'Whether a device may claim this provider right now' })
  eligible: boolean;

  @ApiProperty({ nullable: true, description: 'Why it may not, in one line' })
  reason: string | null;

  @ApiProperty({ description: 'Consecutive failed attempts' })
  attempts: number;

  @ApiProperty({ nullable: true })
  cooldownUntil: string | null;

  @ApiProperty({ nullable: true, description: 'The device currently attempting, if any' })
  leasedBy: string | null;
}

export class ClaimLoginResultDto {
  @ApiProperty({ description: 'When the claim lapses if nothing releases it' })
  leaseExpiresAt: string;

  @ApiProperty({ description: 'The number the provider will text the code to' })
  phone: string;
}
