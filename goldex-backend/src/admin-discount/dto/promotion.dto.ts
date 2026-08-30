import { ApiProperty } from "@nestjs/swagger";
import { PromotionTypeEnum } from "../enum/promotion.enum";
import { AdminInfoDto } from "../../admin/dto/admin.info.dto";
import { DiscountTypeEnum } from "../../user-discount/enum/discountType.enum";

export class PromotionDto {
  @ApiProperty()
  id: number;
  @ApiProperty()
  title: string;
  @ApiProperty()
  description: string;
  @ApiProperty({ enum: PromotionTypeEnum })
  promotionType: string;
  @ApiProperty({ enum: DiscountTypeEnum })
  discountType: string;
  @ApiProperty()
  promotionAmount: number;
  @ApiProperty()
  promotionPercentage: number;
  @ApiProperty()
  maxPromotion: number;
  @ApiProperty()
  usageCount: number;
  @ApiProperty()
  usageLimit: number;
  @ApiProperty()
  isActive: boolean;
  @ApiProperty()
  startAt: Date;
  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({ type: AdminInfoDto })
  adminInfo?: AdminInfoDto;

  @ApiProperty()
  createdAt: Date;
  @ApiProperty()
  updatedAt: Date;
  @ApiProperty()
  deletedAt: Date;
}
