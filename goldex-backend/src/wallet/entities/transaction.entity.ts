import { myBaseEntity } from "../../shared/entity/base.entity";
import { Column, Entity, ManyToOne, JoinColumn } from "typeorm";
import { WalletEntity } from "./wallet.entity";
import { TransactionTypeEnum } from "../enum/transaction.type.enum";
import { TransactionStatusEnum } from "../enum/transaction.status.enum";
import { OrderEntity } from "../../order/order.entity";

@Entity("transaction")
export class TransactionEntity extends myBaseEntity {
  @ManyToOne(() => WalletEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "wallet_id" })
  wallet: WalletEntity;

  @Column({ name: "wallet_id" })
  walletId: string;

  @ManyToOne(() => OrderEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "order_id" })
  order: OrderEntity;

  @Column({ name: "order_id", nullable: true, type: "uuid" })
  orderId: string;

  @Column({
    type: "varchar",
    length: 100,
    name: "transaction_id",
    unique: true,
  })
  transactionId: string;

  @Column({
    type: "enum",
    enum: TransactionTypeEnum,
    name: "transaction_type",
  })
  transactionType: TransactionTypeEnum;

  @Column({
    type: "enum",
    enum: TransactionStatusEnum,
    default: TransactionStatusEnum.PENDING,
    name: "status",
  })
  status: TransactionStatusEnum;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    name: "amount",
  })
  amount: number;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    default: 0,
    name: "fee",
  })
  fee: number;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    nullable: true,
    name: "price",
  })
  price: number;

  @Column({
    type: "text",
    nullable: true,
    name: "description",
  })
  description: string;

  @Column({
    type: "jsonb",
    nullable: true,
    name: "metadata",
  })
  metadata: any;

  @Column({
    type: "timestamp",
    nullable: true,
    name: "completed_at",
  })
  completedAt: Date;
}
