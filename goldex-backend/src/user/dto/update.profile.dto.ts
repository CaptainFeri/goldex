import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ description: 'country', example: 'number' })
  @ApiPropertyOptional()
  countryId: number;

  @ApiProperty({ description: 'Gender', example: 'Male/Female' })
  @ApiPropertyOptional()
  gender: number;

  @ApiProperty({ description: 'address', example: '' })
  @ApiPropertyOptional()
  address: string;

  @ApiProperty({ description: 'postal_code', example: '' })
  @ApiPropertyOptional()
  postalCode: string;

  @ApiProperty({ description: 'phone', example: '09...' })
  @ApiPropertyOptional()
  phone: string;
}
