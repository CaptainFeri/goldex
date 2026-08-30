import { Column, Entity, OneToMany } from "typeorm";
import { MyLocalBaseEntity } from "../../shared/entity/base.local.entity";

@Entity("promotion")
export class PromotionEntity extends MyLocalBaseEntity {
  @Column({ name: "title" })
  title: string;

  @Column({ name: "description" })
  description: string;

  @Column({ name: "promotion_type" })
  promotionType: string;

  @Column({
    type: "decimal",
    precision: 22,
    scale: 2,
    default: 0,
    nullable: true,
    name: "promotion_amount",
  })
  promotionAmount?: number;

  @Column({
    type: "decimal",
    precision: 22,
    scale: 2,
    default: 0,
    nullable: true,
    name: "promotion_percentage",
  })
  promotionPercentage?: number;

  @Column({ name: "usage_limit" })
  usageLimit: number;

  @Column({ name: "max_promotion", default: 0 })
  maxPromotion?: number;

  @Column({ name: "usage_count" })
  usageCount: number;

  @Column({ name: "is_active" })
  isActive: boolean;

  @Column({ name: "start_at" })
  startAt: Date;

  @Column({ name: "expired_at" })
  expiredAt: Date;

  @Column({ name: "admin_id" })
  adminId: string;

  @Column({ name: "is_expired" })
  isExpired: boolean;

  @Column({ name: "coupon_type" })
  couponType: string;
}
