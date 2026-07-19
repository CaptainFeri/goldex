import { Column, Entity, OneToMany } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";

@Entity("user_level")
export class UserLevelEntity extends myBaseEntity {
  @Column({ type: "varchar", length: 100, unique: true })
  name: string;

  @Column({ type: "varchar", length: 100, unique: true })
  slug: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "int", default: 0 })
  priority: number;

  @Column({ type: "boolean", default: false, name: "is_default" })
  isDefault: boolean;

  @Column({ type: "jsonb", default: {} })
  features: Record<string, any>;

  @OneToMany(() => UserEntity, (u) => u.level)
  users: UserEntity[];
}
