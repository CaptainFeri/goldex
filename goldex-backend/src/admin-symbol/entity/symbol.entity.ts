import { Column, Entity, OneToMany } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { GainTypeEnum } from "../enum/gain.type.enum";
import { SymbolTypeEnum } from "../enum/symbol.type.enum";
import { UnitTypeEnum } from "../enum/unit.type.enum";
import { PaymentGatewayEnum } from "../enum/payment.gateway.enum";
import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";

@Entity("symbol")
export class SymbolEntity extends myBaseEntity {
  @Column({
    name: "name",
    nullable: false,
  })
  name: string;

  @Column({
    name: "slug",
    nullable: false,
  })
  slug: string;

  @Column({
    nullable: true,
    default: PaymentGatewayEnum.UP,
    name: "payment_gateway_type",
  })
  paymentGateWayType?: PaymentGatewayEnum;

  @Column({
    name: "pic_path",
    nullable: false,
  })
  picPath: string;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true })
  gain: number;

  @Column({
    nullable: false,
    default: GainTypeEnum.NUMBER,
    name: "gain_type",
  })
  gainType: GainTypeEnum;

  @Column({
    nullable: false,
    default: SymbolTypeEnum.FIAT,
    name: "symbol_type",
  })
  symbolType: SymbolTypeEnum;

  @Column({
    nullable: false,
    default: UnitTypeEnum.NUMBER,
    name: "unit_type",
  })
  unitType: UnitTypeEnum;

  @Column({
    default: false,
    name: "has_payment_gateway",
  })
  hasPaymentGateway: boolean;

  @Column({
    default: false,
    name: "is_active",
  })
  isActive: boolean;

  @OneToMany(() => PricePairEntity, (pair) => pair.quoteSymbol)
  quotePairs: PricePairEntity[];

  @OneToMany(() => PricePairEntity, (pair) => pair.baseSymbol)
  basePairs: PricePairEntity[];
}
