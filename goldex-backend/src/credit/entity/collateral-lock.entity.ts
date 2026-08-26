import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { CreditEntity } from "./credit.entity";
import { CreditOrderEntity } from "./credit-order.entity";
import { CollateralLockStatusEnum } from "../enum/collateral-lock-status.enum";

/**
 * Per-trade collateral lock (handoff §13).
 *
 * Each credit trade locks a portion of the user's collateral:
 *   requiredCollateral = exposure / leverage
 *
 * The lock lifecycle mirrors the trade exposure:
 *   CREATED → ACTIVE → RELEASE_PENDING → RELEASED | CONSUMED
 *
 * Collateral Available = collateralTotal − Σ(ACTIVE/RELEASE_PENDING locks).
 */
@Entity("collateral_lock")
@Index("IDX_COLLATERAL_LOCK_CREDIT", ["creditId"])
@Index("IDX_COLLATERAL_LOCK_TRADE", ["creditOrderId"])
export class CollateralLockEntity extends myBaseEntity {
  @ManyToOne(() => CreditEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "credit_id" })
  credit: CreditEntity;

  @Column({ name: "credit_id" })
  creditId: string;

  @ManyToOne(() => CreditOrderEntity, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "credit_order_id" })
  creditOrder: CreditOrderEntity | null;

  @Column({ name: "credit_order_id", type: "uuid", nullable: true })
  creditOrderId: string | null;

  /** Locked collateral quantity in collateral units (e.g. grams of XAU). */
  @Column({ type: "decimal", precision: 20, scale: 8, name: "amount" })
  amount: number;

  @Column({
    type: "enum",
    enum: CollateralLockStatusEnum,
    default: CollateralLockStatusEnum.CREATED,
    name: "status",
  })
  status: CollateralLockStatusEnum;

  /** Notional exposure this lock backs (in the credit base symbol units). */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "notional_value" })
  notionalValue: number;

  /** The mark price of the collateral when the lock was created. */
  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "price_at_lock" })
  priceAtLock: number;

  @Column({ type: "timestamptz", nullable: true, name: "activated_at" })
  activatedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "released_at" })
  releasedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "consumed_at" })
  consumedAt: Date;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;
}