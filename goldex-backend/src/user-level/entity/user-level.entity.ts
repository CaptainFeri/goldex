import { Column, Entity, OneToMany, ManyToMany, JoinTable } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";

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

  @ManyToMany(() => PricePairEntity, (p) => p.levels)
  @JoinTable({
    name: "user_level_pairs",
    joinColumn: { name: "level_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "pair_id", referencedColumnName: "id" },
  })
  pairs: PricePairEntity[];

  @OneToMany(() => UserEntity, (u) => u.level)
  users: UserEntity[];
}
