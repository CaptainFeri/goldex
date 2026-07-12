import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../shared/entity/base.entity";
import { UserEntity } from "../user/entity/user.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { OrderSideEnum } from "../order/enum/order.side.enum";

export enum QuoteRequestStatus {
  PENDING = "PENDING",
  MATCHED = "MATCHED",
  CANCELLED = "CANCELLED",
}

@Entity("quote_request")
export class QuoteRequestEntity extends myBaseEntity {
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "price_pair_id", type: "uuid" })
  pricePairId: string;

  @ManyToOne(() => PricePairEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "price_pair_id" })
  pricePair: PricePairEntity;

  @Column({ type: "enum", enum: OrderSideEnum, name: "side" })
  side: OrderSideEnum;

  @Column({ type: "decimal", precision: 20, scale: 8, name: "quantity" })
  quantity: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "price" })
  price: number;

  @Column({ type: "varchar", length: 20, default: QuoteRequestStatus.PENDING, name: "status" })
  status: QuoteRequestStatus;

  @Column({ name: "matched_user_id", type: "uuid", nullable: true })
  matchedUserId: string;

  @Column({ name: "matched_at", type: "timestamp", nullable: true })
  matchedAt: Date;

  @Column({ type: "text", name: "notes", nullable: true })
  notes: string;

  // Telegram channel message tracking for updating on match
  @Column({ name: "channel_chat_id", type: "varchar", length: 255, nullable: true })
  channelChatId: string;

  @Column({ name: "channel_message_id", type: "varchar", length: 255, nullable: true })
  channelMessageId: string;
}
