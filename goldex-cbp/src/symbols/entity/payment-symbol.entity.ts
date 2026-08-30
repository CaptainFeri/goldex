import { Column, Entity } from "typeorm";
import { myBaseEntity } from "../../common/entity/base.entity";
import { SymbolTypeEnum } from "../enum/symbol.type.enum";

/**
 * A payment symbol (e.g. RIAL, USD, gold).
 * Configures which deposit/withdraw types are offered and, when
 * hasPaymentGateway is true, which registered gateway providers are selectable.
 */
@Entity("payment_symbol")
export class PaymentSymbolEntity extends myBaseEntity {
  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({
    type: "enum",
    enum: SymbolTypeEnum,
    default: SymbolTypeEnum.FIAT,
    name: "symbol_type",
  })
  symbolType: SymbolTypeEnum;

  @Column({ default: false, name: "has_payment_gateway" })
  hasPaymentGateway: boolean;

  @Column({ default: false, name: "is_active" })
  isActive: boolean;

  @Column("jsonb", { default: [], name: "deposit_types" })
  depositTypes: string[];

  @Column("jsonb", { default: [], name: "withdraw_types" })
  withdrawTypes: string[];

  @Column("jsonb", { default: [], name: "deposit_gateways" })
  depositGateways: string[];

  @Column("jsonb", { default: [], name: "withdraw_gateways" })
  withdrawGateways: string[];

  @Column({ nullable: true, name: "default_deposit_gateway" })
  defaultDepositGateway?: string;

  @Column({ nullable: true, name: "default_withdraw_gateway" })
  defaultWithdrawGateway?: string;
}
