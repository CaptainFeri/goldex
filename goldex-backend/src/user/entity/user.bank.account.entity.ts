import { myBaseEntity } from "../../shared/entity/base.entity";
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { UserEntity } from "./user.entity";

@Entity("user_bank_account")
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

  @Column({
    name: "user_id",
    unique: true,
  })
  userId: string;

  @Column({
    nullable: true,
    name: "verified_at",
  })
  verifiedAt?: Date;
}
