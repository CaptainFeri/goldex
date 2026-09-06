import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsObject,
  IsNotEmpty,
  IsEnum,
} from 'class-validator';
import {
  CurrencyUnit,
  DEFAULT_PROVIDER_PRICE_UNIT,
} from '../../shared/currency/currency-unit';

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

  @ApiPropertyOptional({
    enum: CurrencyUnit,
    default: DEFAULT_PROVIDER_PRICE_UNIT,
    description:
      'Currency unit this provider quotes in. Toman quotes are multiplied by ten on ingest so the books stay Rial-only.',
  })
  @IsEnum(CurrencyUnit)
  @IsOptional()
  priceUnit?: CurrencyUnit;

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
