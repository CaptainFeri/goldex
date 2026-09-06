import { Column, Entity, OneToMany } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { GainTypeEnum } from "../enum/gain.type.enum";
import { MarketTypeEnum } from "../../admin-pair/enum/market.type.enum";
import { SymbolTypeEnum } from "../enum/symbol.type.enum";
import { UnitTypeEnum } from "../enum/unit.type.enum";
import { DepositTypeEnum } from "../enum/deposit-type.enum";
import { WithdrawTypeEnum } from "../enum/withdraw-type.enum";
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
    name: "pic_path",
    nullable: false,
  })
  picPath: string;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true })
  gain: number;

  /**
   * The camelCase key the panels use for this instrument (`gold18`,
   * `emamiCoin`, `usdToman`, …). Carried here so the ticker and the price
   * instrument catalogue are served from the database rather than duplicated
   * in each panel's constants file.
   */
  @Column({ name: "ticker_key", type: "varchar", length: 64, nullable: true })
  tickerKey?: string;

  /** Shown in the market ticker marquee. */
  @Column({ name: "is_ticker", type: "boolean", default: false })
  isTicker: boolean;

  /** Ordering within the ticker and the instrument picker. */
  @Column({ name: "display_order", type: "int", default: 0 })
  displayOrder: number;

  /** Grouping for the price screen: طلا / سکه / نقره / ارز / کریپتو / کالا. */
  @Column({ name: "category", type: "varchar", length: 64, nullable: true })
  category?: string;

  /**
   * Chart colour for the price screen, as a CSS hex string.
   *
   * Nullable on purpose: most symbols predate the column, and the price
   * endpoints derive a stable hue from the slug when it is unset rather than
   * making every desk fill sixty of these in before a chart draws.
   */
  @Column({ name: "color", type: "varchar", length: 9, nullable: true })
  color?: string;

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

  /** Deposit flows this symbol offers. Constrained by the symbol type. */
  @Column("jsonb", {
    nullable: true,
    default: [],
    name: "deposit_types",
  })
  depositTypes: DepositTypeEnum[];

  /** Withdraw flows this symbol offers. Constrained by the symbol type. */
  @Column("jsonb", {
    nullable: true,
    default: [],
    name: "withdraw_types",
  })
  withdrawTypes: WithdrawTypeEnum[];

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
