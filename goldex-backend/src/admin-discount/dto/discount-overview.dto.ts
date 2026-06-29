export class DiscountOverviewDto {
  id: number;
  code: string;
  couponType: string;
  usageCount: number;
  usageLimit: number;
  isActive: boolean;
  expiresAt: Date;
  createdAt: Date;
}
