import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { UserEntity } from './user.entity';
import { MyLocalBaseEntity } from '../../shared/entity/base.local.entity';

@Entity('user_2fa_setting')
export class User2FASettingEntity extends MyLocalBaseEntity {
  @OneToOne(() => UserEntity)
  @JoinColumn({
    name: 'user_id',
  })
  user: UserEntity;

  @Column({
    nullable: true,
    name: 'withdrawal_activated_at',
  })
  withdrawalActivatedAt?: Date;

  @Column({
    nullable: true,
    name: 'login_activated_at',
  })
  loginActivatedAt?: Date;
}
