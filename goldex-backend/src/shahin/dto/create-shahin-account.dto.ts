import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateShahinAccountDto {
  @ApiProperty({ example: '1092152517', description: 'Account number' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiProperty({ example: 'BKV', description: 'Bank code', default: 'BKV' })
  @IsString()
  @IsOptional()
  bankCode?: string;

  @ApiProperty({ example: 'IR450560611828006913644801', description: 'IBAN', required: false })
  @IsString()
  @IsOptional()
  iban?: string;

  @ApiProperty({ example: 'John Doe', description: 'Owner name', required: false })
  @IsString()
  @IsOptional()
  ownerName?: string;

  @ApiProperty({ example: 'بانک کشاورزی', description: 'Bank name', required: false })
  @IsString()
  @IsOptional()
  bankName?: string;

  @ApiProperty({ example: '14012938791', description: 'National code', required: false })
  @IsString()
  @IsOptional()
  nationalCode?: string;

  @ApiProperty({ example: 1000000, description: 'Balance', required: false })
  @IsNumber()
  @IsOptional()
  balance?: number;

  @ApiProperty({ example: 'active', description: 'Account status', default: 'active' })
  @IsString()
  @IsOptional()
  accountStatus?: string;

  @ApiProperty({ example: 'savings', description: 'Account type', required: false })
  @IsString()
  @IsOptional()
  accountType?: string;

  @ApiProperty({ example: {}, description: 'Additional metadata', required: false })
  @IsOptional()
  metadata?: any;
}

