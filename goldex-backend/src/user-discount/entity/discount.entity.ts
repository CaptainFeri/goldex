import { Column, Entity } from 'typeorm';
import { MyLocalBaseEntity } from '../../shared/entity/base.local.entity';

@Entity('discount_coupon')
export class DiscountCouponEntity extends MyLocalBaseEntity {
  @Column({ name: 'code' })
  code: string;

  @Column({ name: 'coupon_type' })
  couponType: string;

  @Column({
    type: 'decimal',
    precision: 22,
    scale: 2,
    default: 0,
    nullable: true,
    name: 'discount_amount',
  })
  discountAmount?: number;

  @Column({
    type: 'decimal',
    precision: 22,
    scale: 2,
    default: 0,
    nullable: true,
    name: 'discount_percentage',
  })
  discountPercentage?: number;

  @Column({ name: 'max_discount' })
  maxDiscount?: number;

  @Column({ name: 'usage_count' })
  usageCount: number;

  @Column({ name: 'usage_limit' })
  usageLimit: number;

  @Column({ name: 'is_active' })
  isActive: boolean;

  @Column({ name: 'expired_at' })
  expiredAt: Date;

  @Column({ name: 'admin_id' })
  adminId: string;
}
