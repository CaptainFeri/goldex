import { Column, Entity } from 'typeorm';
import { MyLocalBaseEntity } from '../../shared/entity/base.local.entity';

@Entity('language')
export class LanguageEntity extends MyLocalBaseEntity {
  @Column({ name: 'locale' })
  locale: string;

  @Column({ name: 'name' })
  name: string;

  @Column({ name: 'native_name' })
  nativeName: string;

  @Column({ name: 'is_active' })
  isActive: boolean;
}
