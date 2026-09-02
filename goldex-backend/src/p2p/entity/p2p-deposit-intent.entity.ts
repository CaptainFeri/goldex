import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { DepositEntity } from "../../deposit/deposit.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { P2pIntentStateEnum } from "../enum/p2p.enums";

/** The p2p detail of a deposit, 1:1 with the `deposit` row that carries it. */
@Entity("p2p_deposit_intent")
@Index(["state", "symbolId"])
export class P2pDepositIntentEntity extends myBaseEntity {
  @Column({ name: "deposit_id", type: "uuid", unique: true })
  depositId: string;

  @ManyToOne(() => DepositEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "deposit_id" })
  deposit: DepositEntity;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "symbol_id", type: "uuid" })
  symbolId: string;

  @ManyToOne(() => SymbolEntity)
  @JoinColumn({ name: "symbol_id" })
  symbol: SymbolEntity;

  @Column({ name: "requested_amount", type: "decimal", precision: 20, scale: 8 })
  requestedAmount: number;

  @Column({ name: "constraints_json", type: "jsonb", nullable: true })
  constraintsJson?: Record<string, any>;

  /** IBAN the depositor said they will transfer from. Not ownership-checked. */
  @Column({ name: "source_iban", nullable: true })
  sourceIban?: string;

  @Column({ name: "source_bank_account_id", type: "uuid", nullable: true })
  sourceBankAccountId?: string;

  @Column({
    name: "state",
    type: "enum",
    enum: P2pIntentStateEnum,
    default: P2pIntentStateEnum.CREATED,
  })
  state: P2pIntentStateEnum;

  @Column({ name: "retry_count", type: "int", default: 0 })
  retryCount: number;

  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt?: Date;
}
