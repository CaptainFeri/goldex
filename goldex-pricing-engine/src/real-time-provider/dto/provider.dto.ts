import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsBoolean, IsNumber, IsOptional, IsObject } from 'class-validator';

export class ProviderDto {
  @ApiProperty({ description: 'Provider UUID' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'Unique key' })
  @IsString()
  key!: string;

  @ApiProperty({ description: 'Category' })
  @IsString()
  category!: string;

  @ApiProperty({ description: 'Base URL' })
  @IsString()
  baseUrl!: string;

  @ApiPropertyOptional({ description: 'Base REST API URL' })
  @IsString()
  @IsOptional()
  apiBaseUrl?: string;

  @ApiProperty({ description: 'Phone number' })
  @IsString()
  phone!: string;

  @ApiPropertyOptional({ description: 'Persian name for display' })
  @IsString()
  @IsOptional()
  persianName?: string;

  @ApiPropertyOptional({ description: 'Web panel login URL' })
  @IsString()
  @IsOptional()
  webPanelUrl?: string;

  @ApiPropertyOptional({ description: 'Send OTP endpoint URL' })
  @IsString()
  @IsOptional()
  sendOtpUrl?: string;

  @ApiPropertyOptional({ description: 'Verify OTP endpoint URL' })
  @IsString()
  @IsOptional()
  verifyCodeUrl?: string;

  @ApiProperty({ description: 'Auth configuration' })
  @IsObject()
  auth!: Record<string, any>;

  @ApiProperty({ description: 'Extra config' })
  @IsObject()
  config!: Record<string, any>;

  @ApiProperty({ description: 'Active status' })
  @IsBoolean()
  active!: boolean;

  @ApiProperty({ description: 'Metadata refresh interval' })
  @IsNumber()
  metadataRefreshIntervalMs!: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: Date;
}
