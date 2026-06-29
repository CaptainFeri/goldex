import { ApiProperty } from '@nestjs/swagger';
import { DiscountTypeEnum } from '../../user-discount/enum/discountType.enum';

export class CreatePromotionDto {
  @ApiProperty()
  title: string;
  @ApiProperty()
  description: string;
  @ApiProperty()
  promotionType: string;
  @ApiProperty()
  promotionAmount: number;
  @ApiProperty()
  promotionPercentage: number;
  @ApiProperty()
  maxPromotion: number;
  @ApiProperty()
  usageLimit: number;
  @ApiProperty()
  startAt: Date;
  @ApiProperty()
  expiresAt: Date;

  @ApiProperty()
  discountType: DiscountTypeEnum;
  @ApiProperty()
  selectedChallengeIdList: string[];
}
