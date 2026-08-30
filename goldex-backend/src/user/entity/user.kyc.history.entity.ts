// modules/user/entity/user.kyc.history.entity.ts

import { Column, Entity, ManyToOne, JoinColumn, CreateDateColumn, PrimaryGeneratedColumn } from "typeorm";
import { UserEntity } from "./user.entity";
import { KycLevelEnum } from "../../baseinfo/enum/kycLevel.enum";
import { KycStatusEnum } from "../../baseinfo/enum/kycStatus.enum";

@Entity("user_kyc_history")
export class UserKycHistoryEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column()
  userId: string;

  @Column({
    type: "int",
    default: KycLevelEnum.NONE,
  })
  level: number;

  @Column({
    type: "int",
    default: KycStatusEnum.PENDING,
  })
  status: number;

  @Column({
    type: "varchar",
    nullable: true,
  })
  reason?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
