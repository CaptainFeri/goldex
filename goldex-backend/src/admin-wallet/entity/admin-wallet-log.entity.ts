import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { WalletEntity } from "../../wallet/entities/wallet.entity";

@Entity("admin_wallet_logs")
export class AdminWalletLogEntity extends myBaseEntity {
  @Column({ name: "admin_id", type: "uuid" })
  adminId: string;

  @Column({ name: "wallet_id", type: "uuid" })
  walletId: string;

  @Column({ name: "action", type: "varchar", length: 50 })
  action: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;

  @ManyToOne(() => WalletEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "wallet_id" })
  wallet: WalletEntity;
}
