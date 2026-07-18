import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from "class-validator";
import { Transform } from "class-transformer";
import { DiscountTypeEnum } from "../../user-discount/enum/discountType.enum";

export class CreateAdminDiscountDto {
  @Transform(({ value }) => {
    if (typeof value !== "string") return value;
    const map: Record<string, string> = { percent: "percentage", fixed: "fixed", percentage: "percentage" };
    return map[value.toLowerCase()] ?? value;
  })
  @IsEnum(DiscountTypeEnum)
  @ApiProperty({ enum: DiscountTypeEnum })
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
