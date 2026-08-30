import { AdminInfoDto } from '../../admin/dto/admin.info.dto';

export class getDiscountCouponDto {
  id: number;
  code: string;
  couponType: string;
  discountAmount: number;
  discountPercentage: number;
  maxDiscount: number;
  usageCount: number;
  usageLimit: number;
  isActive: boolean;
  expiredAt: Date;
  adminInfo: AdminInfoDto;
  createdAt: Date;
  updatedAt: Date;
}
