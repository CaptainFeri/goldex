import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { UserEntity } from './user.entity';
import { UserDeviceEntity } from './user.device.entity';
import { MyLocalBaseEntity } from '../../shared/entity/base.local.entity';

@Entity('user_refresh_token')
export class UserRefreshTokenEntity extends MyLocalBaseEntity {
  @ManyToOne(() => UserEntity, (user) => user.refreshes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @OneToOne(() => UserDeviceEntity, { eager: true })
  @JoinColumn({
    name: 'device_id',
  })
  device: UserDeviceEntity;

  @Column({ name: 'token', nullable: true })
  token?: string;

  @Column({ name: 'expired_at', nullable: true })
  expiredAt?: Date;
}
