import { Column, Entity } from 'typeorm';
import { myBaseEntity } from '../../shared/entity/base.entity';

@Entity('user_login_history')
export class UserLoginHistoryEntity extends myBaseEntity {
  @Column()
  status: number;

  @Column({
    name: 'ip_address',
  })
  ipAddress: string;

  @Column({
    name: 'user_id',
  })
  userId: string;

  @Column({
    name: 'device_info',
  })
  deviceInfo: string;
}
