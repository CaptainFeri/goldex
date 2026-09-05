import { myBaseEntity } from "../shared/entity/base.entity";
import { Column, Entity, ManyToOne, JoinColumn, OneToMany, VersionColumn } from "typeorm";
import { UserEntity } from "../user/entity/user.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { OrderSideEnum } from "./enum/order.side.enum";
import { OrderTypeEnum } from "./enum/order.type.enum";
import { OrderStatusEnum } from "./enum/order.status.enum";

@Entity("order")
export class OrderEntity extends myBaseEntity {
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => PricePairEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "price_pair_id" })
  pricePair: PricePairEntity;

  @Column({ name: "price_pair_id", type: "uuid" })
  pricePairId: string;

  @Column({
    name: "order_code",
    type: "varchar",
    length: 50,
    unique: true,
  })
  orderCode: string;

  @Column({
    type: "enum",
    enum: OrderSideEnum,
    name: "side",
  })
  side: OrderSideEnum;

  @Column({
    type: "enum",
    enum: OrderTypeEnum,
    name: "order_type",
  })
  orderType: OrderTypeEnum;

  @Column({
    type: "enum",
    enum: OrderStatusEnum,
    default: OrderStatusEnum.PENDING,
    name: "status",
  })
  status: OrderStatusEnum;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    name: "quantity",
  })
  quantity: number;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    default: 0,
    name: "executed_quantity",
  })
  executedQuantity: number;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    nullable: true,
    name: "price",
  })
  price: number; // pure per-GRAM price (= provider price) used to settle with the provider

  // Customer-shown per-GRAM price (pure ± commission ± gain). The user is charged
  // this on a BUY; the gap vs `price` is the platform's spread profit (in XAU).
  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    nullable: true,
    name: "customer_price",
  })
  customerPrice: number;

  // Same price expressed per MESGHAL (price × MESQAL_TO_GRAM).
  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    nullable: true,
    name: "mesghal_price",
  })
  mesghalPrice: number;

  // ── Price routing record ─────────────────────────────────────────
  // How `mesghalPrice` was arrived at. DIRECT means the pair's own quote;
  // BRIDGE means it was composed through `bridgeSymbolId`. `mesghalPrice`
  // itself keeps the same meaning either way — the pure price per mesghal in
  // the pair's quote currency — so settlement needs no special case.
  @Column({ type: "varchar", length: 10, nullable: true, name: "route_mode" })
  routeMode: string | null;

  @Column({ type: "uuid", nullable: true, name: "bridge_symbol_id" })
  bridgeSymbolId: string | null;

  /** Quote-per-bridge rate used to compose the price (e.g. IRR per USD). */
  @Column({
    type: "decimal",
    precision: 24,
    scale: 12,
    nullable: true,
    name: "bridge_rate",
  })
  bridgeRate: number | null;

  /** Each leg as `{ pair, price, provider, inverted }`, for reconstruction. */
  @Column("jsonb", { nullable: true, name: "route_legs" })
  routeLegs: Record<string, any>[] | null;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    default: 0,
    name: "average_price",
  })
  averagePrice: number;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    default: 0,
    name: "total_value",
  })
  totalValue: number;

  @Column({
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
    name: "commission",
  })
  commission: number;

  @Column({
    type: "timestamp",
    nullable: true,
    name: "completed_at",
  })
  completedAt: Date;

  @Column({
    type: "timestamp",
    nullable: true,
    name: "cancelled_at",
  })
  cancelledAt: Date;

  @Column({
    type: "text",
    nullable: true,
    name: "notes",
  })
  notes: string;

  @Column({
    type: "jsonb",
    nullable: true,
    name: "metadata",
  })
  metadata: any;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "provider_order_id",
  })
  providerOrderId: string;

  @VersionColumn({ default: 1 })
  version: number;

  // ── Credit v2 pend-deadline tracking (credit-linked requests only) ──
  @Column({ type: "boolean", default: false, name: "is_credit_linked" })
  isCreditLinked: boolean;

  @Column({ type: "timestamptz", nullable: true, name: "pend_deadline_warn_at" })
  pendDeadlineWarnAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "pend_deadline_expire_at" })
  pendDeadlineExpireAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "pend_deadline_grace_end_at" })
  pendDeadlineGraceEndAt: Date;

  @Column({ type: "varchar", length: 20, nullable: true, name: "pend_deadline_state" })
  pendDeadlineState: string;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.order)
  transactions: TransactionEntity[];

  getRemainingQuantity(): number {
    return this.quantity - this.executedQuantity;
  }

  isFullyExecuted(): boolean {
    return this.executedQuantity >= this.quantity;
  }

  isPartiallyExecuted(): boolean {
    return this.executedQuantity > 0 && this.executedQuantity < this.quantity;
  }

  updateExecutedQuantity(quantity: number, price: number): void {
    const oldQuantity = this.executedQuantity;
    this.executedQuantity += quantity;

    const oldTotalValue = oldQuantity * this.averagePrice;
    const newTotalValue = quantity * price;
    this.totalValue = oldTotalValue + newTotalValue;
    this.averagePrice = this.totalValue / this.executedQuantity;

    if (this.isFullyExecuted()) {
      this.status = OrderStatusEnum.COMPLETED;
      this.completedAt = new Date();
    } else if (this.executedQuantity > 0) {
      this.status = OrderStatusEnum.PARTIALLY_COMPLETED;
    }
  }
}
