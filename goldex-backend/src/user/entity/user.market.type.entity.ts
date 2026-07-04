import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "./user.entity";
import { MarketTypeEnum } from "../../admin-pair/enum/market.type.enum";

@Entity("user_market_types")
@Unique(["userId", "marketType"])
export class UserMarketTypeEntity extends myBaseEntity {
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => UserEntity, (user) => user.marketTypes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({
    type: "enum",
    enum: MarketTypeEnum,
    name: "market_type",
  })
  marketType: MarketTypeEnum;
}
