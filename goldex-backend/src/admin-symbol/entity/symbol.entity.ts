import { Column, Entity, OneToMany } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { GainTypeEnum } from "../enum/gain.type.enum";
import { MarketTypeEnum } from "../../admin-pair/enum/market.type.enum";
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
    type: "enum",
    enum: MarketTypeEnum,
    default: MarketTypeEnum.FORMAL,
    name: "market_type",
  })
  marketType: MarketTypeEnum;

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

  @Column("jsonb", {
    nullable: true,
    default: [],
    name: "deposit_types",
  })
  depositTypes: string[];

  @Column("jsonb", {
    nullable: true,
    default: [],
    name: "withdraw_types",
  })
  withdrawTypes: string[];

  /** Gateway provider codes selectable for deposits (e.g. "kaino-informal"). */
  @Column("jsonb", {
    nullable: true,
    default: [],
    name: "deposit_gateways",
  })
  depositGateways: string[];

  /** Gateway provider codes selectable for withdrawals. */
  @Column("jsonb", {
    nullable: true,
    default: [],
    name: "withdraw_gateways",
  })
  withdrawGateways: string[];

  @Column({
    nullable: true,
    name: "default_deposit_gateway",
  })
  defaultDepositGateway?: string;

  @Column({
    nullable: true,
    name: "default_withdraw_gateway",
  })
  defaultWithdrawGateway?: string;

  @OneToMany(() => PricePairEntity, (pair) => pair.quoteSymbol)
  quotePairs: PricePairEntity[];

  @OneToMany(() => PricePairEntity, (pair) => pair.baseSymbol)
  basePairs: PricePairEntity[];
}
