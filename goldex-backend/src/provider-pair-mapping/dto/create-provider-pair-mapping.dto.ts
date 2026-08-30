import { IsString, IsNumber, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProviderPairMappingDto {
  @IsUUID()
  @ApiProperty({ description: 'ID of the existing price pair' })
  pairId: string;

  @IsString()
  @ApiProperty({ description: 'Provider key (e.g. mirrokni, arianatala)' })
  providerKey: string;

  @IsNumber()
  @ApiProperty({ description: 'Item ID from the provider' })
  providerItemId: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false, default: true })
  useBuyPrice?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false, default: true })
  useSellPrice?: boolean;
}

export class UpdateProviderPairMappingDto {
  @IsUUID()
  @IsOptional()
  @ApiProperty({ required: false })
  pairId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  providerKey?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  providerItemId?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  useBuyPrice?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  useSellPrice?: boolean;
}
