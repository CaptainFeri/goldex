// modules/user/entity/user.kyc.entity.ts

import { Column, Entity, JoinColumn, OneToOne } from "typeorm";

import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "./user.entity";
import { KycLevelEnum } from "../../baseinfo/enum/kycLevel.enum";
import { KycStatusEnum } from "../../baseinfo/enum/kycStatus.enum";

@Entity("user_kyc")
export class UserKycEntity extends myBaseEntity {
  @OneToOne(() => UserEntity)
  @JoinColumn({
    name: "user_id",
  })
  user: UserEntity;

  @Column({
    name: "user_id",
    unique: true,
  })
  userId: string;

  @Column({
    nullable: true,
    name: "national_id",
  })
  nationalId?: string;

  @Column({
    nullable: true,
    name: "birth_date",
  })
  birthDate?: string;

  @Column({
    default: KycLevelEnum.NONE,
    name: "level",
  })
  level: number;

  @Column({
    default: KycStatusEnum.PENDING,
    name: "status",
  })
  status: number;

  @Column({
    nullable: true,
    name: "verified_at",
  })
  verifiedAt?: Date;

  @Column({
    nullable: true,
    name: "reject_reason",
  })
  rejectReason?: string;
}
