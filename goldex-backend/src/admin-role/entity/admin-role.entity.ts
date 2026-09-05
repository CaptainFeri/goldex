import { Column, Entity, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";

/** Per-wallet trading configuration a role carries. */
export interface RoleWalletConfig {
  buyFee?: string;
  sellFee?: string;
  withdrawal?: string;
  hasCredit?: "yes" | "no";
  creditAmount?: string;
  roleType?: string;
}

/**
 * A role, as data rather than as an enum value.
 *
 * The four legacy `AdminRole` values become rows here with `isFixed` set. The
 * rule for those is **identity is frozen, configuration is not**: their slug
 * and name cannot change, because code paths key off the slug, but their fees,
 * limits and permission set can — except the root role, which holds all
 * permissions permanently and is the lock-out guard.
 */
@Entity("admin_roles")
export class AdminRoleEntity extends myBaseEntity {
  /** Stable identifier code keys off. Immutable once created. */
  @Index({ unique: true })
  @Column({ type: "varchar", length: 60, unique: true })
  slug: string;

  @Column({ name: "role_name", type: "varchar", length: 120 })
  roleName: string;

  /**
   * Migrated from the `AdminRole` enum.
   *
   * Fixed roles cannot be deleted or renamed; everything else about them is
   * editable, and the root role is the one exception that cannot be edited at
   * all.
   */
  @Column({ name: "is_fixed", type: "boolean", default: false })
  isFixed: boolean;

  /** The 22-key catalog subset this role holds. */
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  permissions: string[];

  /** Wallet families the role may trade: crypto, fiat, metal, rial. */
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  wallets: string[];

  /** Per-wallet fees, withdrawal ceilings and credit, keyed by wallet. */
  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  configs: Record<string, RoleWalletConfig>;

  /** Sorted `"<walletA>-<walletB>"` ids; always a subset of `wallets`. */
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  pairs: string[];

  @Column({ name: "max_credit", type: "decimal", precision: 20, scale: 8, nullable: true })
  maxCredit?: string | null;
}
