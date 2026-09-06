import { Column, Entity } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";

/**
 * Install-wide settings. Exactly one row, enforced by a unique index on
 * `singleton` in the migration — a second row would silently make "the"
 * platform settings ambiguous depending on read order.
 */
@Entity("platform_settings")
export class PlatformSettingsEntity extends myBaseEntity {
  /** Always true; the unique index on it is what keeps this table one row. */
  @Column({ type: "boolean", default: true })
  singleton: boolean;

  /** Display currency for the panels. Amounts on the wire stay in rial. */
  @Column({ name: "display_currency", type: "varchar", length: 16, default: "TOMAN" })
  displayCurrency: string;

  @Column({ type: "varchar", length: 8, default: "fa" })
  language: string;

  @Column({ type: "varchar", length: 64, default: "Asia/Tehran" })
  timezone: string;

  @Column({ type: "varchar", length: 16, default: "jalali" })
  calendar: string;

  /** Rial, like every other amount the API accepts or returns. */
  @Column({ name: "min_withdrawal", type: "numeric", precision: 20, scale: 8, default: 0 })
  minWithdrawal: string;

  @Column({ name: "default_profit_percent", type: "numeric", precision: 6, scale: 3, default: 0 })
  defaultProfitPercent: string;
}
