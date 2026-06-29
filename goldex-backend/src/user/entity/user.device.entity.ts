import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { UserEntity } from './user.entity';
import { myBaseEntity } from '../../shared/entity/base.entity';

@Entity('user_device')
export class UserDeviceEntity extends myBaseEntity {
  @Column({
    name: 'ip_address',
    nullable: false,
  })
  ipAddress: string;

  @Column({ name: 'device_id', nullable: false })
  deviceId: string;

  @Column({
    name: 'device_type',
    nullable: false,
  })
  deviceType: string;

  @Column({
    name: 'user_agent',
    nullable: false,
  })
  userAgent: string;

  @Column({ name: 'last_login', nullable: false })
  lastLogin: Date;

  @ManyToOne(() => UserEntity, (user) => user.devices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}
