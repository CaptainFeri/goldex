import { myBaseEntity } from "../../shared/entity/base.entity";
import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { UserEntity } from "./user.entity";
import { UserBankAccountTagEnum } from "../enum/user-bank-account-tag.enum";

@Entity("user_bank_account")
// A user may hold several accounts now — the KYC one plus any IBAN they have
// used for a p2p transfer — so uniqueness moves from the user to the pair.
@Index(["userId", "iban"], { unique: true })
export class UserBankAccountEntity extends myBaseEntity {
  @Column({
    nullable: true,
    name: "iban",
  })
  iban?: string;

  @Column({
    nullable: true,
    name: "bank_name",
  })
  bankName?: string;

  @Column({
    nullable: true,
    name: "deposit_number",
  })
  depositNumber?: string;

  @ManyToOne(() => UserEntity, (user) => user.banks, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id" })
  userId: string;

  @Column({
    name: "tag",
    type: "enum",
    enum: UserBankAccountTagEnum,
    default: UserBankAccountTagEnum.KYC,
  })
  tag: UserBankAccountTagEnum;

  @Column({
    nullable: true,
    name: "verified_at",
  })
  verifiedAt?: Date;
}
