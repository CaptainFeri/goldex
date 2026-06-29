export class PromotionOverviewDto {
  id: number;
  title: string;
  promotionType: string;
  promotionAmount: number;
  promotionPercentage: number;
  maxPromotion: number;
  usageCount: number;
  usageLimit: number;
  isActive: boolean;
  startAt: Date;
  admin: string;
  discountType: string;
  expiresAt: Date;
}
