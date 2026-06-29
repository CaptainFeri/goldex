import { ApiProperty } from '@nestjs/swagger';

export class CreateAdminDiscountDto {
  @ApiProperty()
  couponType: string;
  @ApiProperty()
  discountAmount: number;
  @ApiProperty()
  discountPercentage: number;
  @ApiProperty()
  maxDiscount: number;
  @ApiProperty()
  usageLimit: number;
  @ApiProperty()
  expiredAt: Date;
}
