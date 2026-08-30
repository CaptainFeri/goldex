import { Column, Entity } from 'typeorm';
import { LanguageEnum } from '../../baseinfo/enum/language.type.enum';
import { MyLocalBaseEntity } from '../../shared/entity/base.local.entity';

@Entity('user_setting')
export class UserSettingEntity extends MyLocalBaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'default_language_id', default: LanguageEnum.English })
  defaultLanguageId: number;

  @Column({ name: 'is_email_notification_enabled', default: false })
  isEmailNotificationEnabled: boolean;
}
