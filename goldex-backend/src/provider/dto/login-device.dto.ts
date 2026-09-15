import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class EnrollDeviceDto {
  @ApiProperty({
    example: 'گوشی میز اپراتور',
    description: 'What this handset is called, so a revoke can be aimed at the right one',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

export class LoginDeviceDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'گوشی میز اپراتور' })
  name: string;

  @ApiProperty({ nullable: true, description: 'When it last presented its credential' })
  lastSeenAt: string | null;

  @ApiProperty({ nullable: true })
  revokedAt: string | null;

  @ApiProperty({ description: 'Whether it is still trusted' })
  active: boolean;

  @ApiProperty()
  createdAt: string | null;
}

export class EnrolledDeviceDto extends LoginDeviceDto {
  @ApiProperty({
    example: 'gxd_VGhpcyBpcyBub3QgYSByZWFsIHRva2Vu',
    description:
      'The credential, shown once and never again. Only its hash is stored, so a lost token ' +
      'is replaced by enrolling a new device rather than recovered.',
  })
  token: string;
}
