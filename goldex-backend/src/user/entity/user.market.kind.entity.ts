import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "./user.entity";
import { MarketKindEnum } from "../../admin-pair/enum/market.kind.enum";

@Entity("user_market_kinds")
@Unique(["userId", "marketKind"])
export class UserMarketKindEntity extends myBaseEntity {
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => UserEntity, (user) => user.marketKinds, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({
    type: "enum",
    enum: MarketKindEnum,
    name: "market_kind",
  })
  marketKind: MarketKindEnum;
}
