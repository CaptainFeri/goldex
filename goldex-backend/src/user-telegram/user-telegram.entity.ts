import { Entity, Column, JoinColumn, OneToOne } from "typeorm";
import { myBaseEntity } from "../shared/entity/base.entity";
import { UserEntity } from "../user/entity/user.entity";

@Entity("user_telegram")
export class UserTelegramEntity extends myBaseEntity {
  @Column({ name: "telegram_id", type: "bigint", unique: true })
  telegramId: number;

  @Column({ name: "user_id" })
  userId: string;

  @OneToOne(() => UserEntity)
  @JoinColumn({ name: "user_id" })
  user: UserEntity;
}
