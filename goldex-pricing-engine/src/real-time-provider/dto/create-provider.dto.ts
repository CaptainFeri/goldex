import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsNumber, IsOptional, IsObject, IsNotEmpty } from 'class-validator';

export class CreateProviderDto {
  @ApiProperty({ description: 'Unique key', example: 'mirrokni' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ description: 'Category', example: 'zaryar' })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({
    description: 'Base WebSocket/URL',
    example: 'https://pnlapi.mirrokni.ir/signalr',
  })
  @IsString()
  @IsNotEmpty()
  baseUrl!: string;

  @ApiPropertyOptional({
    description: 'Base REST API URL (if different from baseUrl)',
    example: 'https://pnlapi.mirrokni.ir',
  })
  @IsString()
  @IsOptional()
  apiBaseUrl?: string;

  @ApiPropertyOptional({
    description: 'Send OTP endpoint URL (overrides default per category)',
    example: 'https://pnlapi.mirrokni.ir/api/User/SendConfirmCode',
  })
  @IsString()
  @IsOptional()
  sendOtpUrl?: string;

  @ApiPropertyOptional({
    description: 'Verify OTP endpoint URL (overrides default per category)',
    example: 'https://pnlapi.mirrokni.ir/auth/verifyCode',
  })
  @IsString()
  @IsOptional()
  verifyCodeUrl?: string;

  @ApiProperty({
    description: 'Phone number for OTP',
    example: '09122650904',
  })
  // @IsPhoneNumber()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({
    description: 'Auth configuration (initial)',
    example: {},
  })
  @IsObject()
  @IsOptional()
  auth?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Extra config', example: {} })
  @IsObject()
  @IsOptional()
  config?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Active status (default false)',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Metadata refresh interval (ms)',
    default: 60000,
  })
  @IsNumber()
  @IsOptional()
  metadataRefreshIntervalMs?: number;
}
