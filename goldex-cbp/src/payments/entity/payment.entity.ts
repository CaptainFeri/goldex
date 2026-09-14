import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../common/entity/base.entity";
import { PaymentSymbolEntity } from "../../symbols/entity/payment-symbol.entity";
import { PaymentCategoryEnum } from "../enum/payment-category.enum";
import { PaymentGatewayKindEnum } from "../enum/payment-gateway-kind.enum";
import { PaymentOperationEnum } from "../enum/payment-operation.enum";
import { PaymentStatusEnum } from "../enum/payment-status.enum";

@Entity("payment")
export class PaymentEntity extends myBaseEntity {
  @Column({ name: "user_id" })
  userId: string;

  /** Backend deposit/withdraw entity id when this payment came via RabbitMQ. */
  @Column({ nullable: true, name: "external_reference" })
  externalReference?: string;

  /**
   * Null only when the request was refused before a symbol could be resolved —
   * an unknown slug, or a sync that never landed. Those failures still have to
   * be recorded and published, or the caller waits on a payment that will never
   * move, so the column cannot demand a symbol the request never had.
   */
  @Column({ name: "symbol_id", nullable: true })
  symbolId: string | null;

  @ManyToOne(() => PaymentSymbolEntity)
  @JoinColumn({ name: "symbol_id" })
  symbol?: PaymentSymbolEntity;

  @Column({ type: "enum", enum: PaymentOperationEnum })
  operation: PaymentOperationEnum;

  @Column({ type: "enum", enum: PaymentCategoryEnum })
  category: PaymentCategoryEnum;

  @Column({
    type: "enum",
    enum: PaymentGatewayKindEnum,
    nullable: true,
    name: "gateway_kind",
  })
  gatewayKind?: PaymentGatewayKindEnum;

  @Column({ nullable: true, name: "gateway_code" })
  gatewayCode?: string;

  @Column()
  type: string;

  @Column({ type: "decimal", precision: 20, scale: 8 })
  amount: number;

  @Column({ nullable: true })
  currency?: string;

  @Column({ type: "enum", enum: PaymentStatusEnum, default: PaymentStatusEnum.PENDING })
  status: PaymentStatusEnum;

  /** Our unique transaction identifier, forwarded to the gateway. */
  @Column({ unique: true, name: "identifier" })
  identifier: string;

  @Column({ nullable: true })
  stan?: string;

  @Column({ nullable: true, name: "ipg_reference" })
  ipgReference?: string;

  /** Payment page URL the user must open to complete the gateway charge. */
  @Column({ nullable: true, name: "gateway_url" })
  gatewayUrl?: string;

  @Column({ nullable: true, name: "callback_url" })
  callbackUrl?: string;

  @Column({ nullable: true, name: "picture_path" })
  picturePath?: string;

  @Column({ nullable: true })
  notes?: string;

  @Column({ nullable: true, name: "admin_id" })
  adminId?: string;

  @Column("jsonb", { nullable: true })
  metadata?: Record<string, any>;

  @Column("jsonb", { nullable: true, name: "raw_request" })
  rawRequest?: Record<string, any>;

  @Column("jsonb", { nullable: true, name: "raw_response" })
  rawResponse?: Record<string, any>;

  @Column({ nullable: true, name: "completed_at" })
  completedAt?: Date;
}
