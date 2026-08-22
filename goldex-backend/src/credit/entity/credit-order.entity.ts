import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { CreditEntity } from "./credit.entity";
import { OrderEntity } from "../../order/order.entity";
import { CreditOrderStatusEnum } from "../enum/credit-order-status.enum";

@Entity("credit_order")
export class CreditOrderEntity extends myBaseEntity {
  @ManyToOne(() => CreditEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "credit_id" })
  credit: CreditEntity;

  @Column({ name: "credit_id" })
  creditId: string;

  @ManyToOne(() => OrderEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order: OrderEntity;

  @Column({ name: "order_id" })
  orderId: string;

  @Column({ type: "decimal", precision: 20, scale: 8, name: "price_at_order_time" })
  priceAtOrderTime: number;

  @Column({ type: "enum", enum: CreditOrderStatusEnum, default: CreditOrderStatusEnum.ACTIVE, name: "status" })
  status: CreditOrderStatusEnum;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true, name: "drawdown_percent" })
  drawdownPercent: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "current_price" })
  currentPrice: number;

  @Column({ type: "timestamptz", nullable: true, name: "margin_called_at" })
  marginCalledAt: Date;

  @Column({ type: "int", default: 1, name: "trade_chain_level" })
  tradeChainLevel: number;

  @Column({ type: "varchar", length: 50, nullable: true, name: "trade_thread_id" })
  tradeThreadId: string;

  @Column({ type: "uuid", nullable: true, name: "parent_credit_order_id" })
  parentCreditOrderId: string;
}
