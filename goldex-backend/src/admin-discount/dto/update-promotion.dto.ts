import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePromotionDto {
  @ApiProperty()
  @ApiPropertyOptional()
  title?: string;

  @ApiProperty()
  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  @ApiPropertyOptional()
  promotionType?: string;

  @ApiProperty()
  @ApiPropertyOptional()
  discountType?: string;

  @ApiProperty()
  @ApiPropertyOptional()
  promotionAmount?: number;

  @ApiProperty()
  @ApiPropertyOptional()
  promotionPercentage?: number;

  @ApiProperty()
  @ApiPropertyOptional()
  maxPromotion?: number;

  @ApiProperty()
  @ApiPropertyOptional()
  usageLimit?: number;

  @ApiProperty()
  @ApiPropertyOptional()
  startAt?: Date;

  @ApiProperty()
  @ApiPropertyOptional()
  expiredAt?: Date;

  @ApiProperty()
  @ApiPropertyOptional()
  newSelectedChallengeIds?: string[];

  @ApiProperty()
  @ApiPropertyOptional()
  deselectedChallengeIds?: string[];

  @ApiProperty()
  @ApiPropertyOptional()
  isActive?: boolean;
}
