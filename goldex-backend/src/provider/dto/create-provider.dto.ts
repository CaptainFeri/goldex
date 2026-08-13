import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsObject,
  IsNotEmpty,
} from 'class-validator';

export class CreateProviderDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsNotEmpty()
  baseUrl!: string;

  @IsString()
  @IsOptional()
  apiBaseUrl?: string;

  @IsString()
  @IsOptional()
  persianName?: string;

  @IsString()
  @IsOptional()
  webPanelUrl?: string;

  @IsString()
  @IsOptional()
  sendOtpUrl?: string;

  @IsString()
  @IsOptional()
  verifyCodeUrl?: string;

  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  auth?: Record<string, any>;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  config?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsNumber()
  @IsOptional()
  metadataRefreshIntervalMs?: number;
}
