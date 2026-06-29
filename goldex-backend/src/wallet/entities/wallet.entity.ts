import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { TransactionEntity } from "./transaction.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { WalletStatusEnum } from "../enum/wallet-status.enum";

@Entity("wallet")
export class WalletEntity extends myBaseEntity {
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id" })
  userId: string;

  @ManyToOne(() => SymbolEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "symbol_id" })
  symbol: SymbolEntity;

  @Column({ name: "symbol_id" })
  symbolId: string;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    default: 0,
    name: "free_balance",
  })
  freeBalance: number;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    default: 0,
    name: "locked_balance",
  })
  lockedBalance: number;

  @Column({
    type: "enum",
    enum: WalletStatusEnum,
    default: WalletStatusEnum.ACTIVE,
    name: "status",
  })
  status: WalletStatusEnum;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    default: 0,
    name: "frozen_free_balance",
  })
  frozenFreeBalance: number;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    default: 0,
    name: "frozen_locked_balance",
  })
  frozenLockedBalance: number;

  @Column({
    type: "timestamp",
    nullable: true,
    name: "frozen_at",
  })
  frozenAt: Date;

  @Column({
    type: "text",
    nullable: true,
    name: "admin_note",
  })
  adminNote: string;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.wallet)
  transactions: TransactionEntity[];

  // Helper methods
  getTotalBalance(): number {
    return this.freeBalance + this.lockedBalance;
  }

  getAvailableBalance(): number {
    return this.freeBalance - this.frozenFreeBalance;
  }

  isFrozen(): boolean {
    return this.status === WalletStatusEnum.FROZEN;
  }
}
