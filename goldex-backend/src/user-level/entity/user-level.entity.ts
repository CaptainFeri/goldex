import { Column, Entity, OneToMany, ManyToMany, JoinTable, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { CreditEnforceModeEnum } from "../../credit/enum/credit-enforce-mode.enum";

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

  // ── Credit v2 config ──────────────────────────────────────────────
  // Base (credit) symbol for this level, e.g. IRR. Level pairs must be
  // quoted in this symbol (XAU/IRR).
  @ManyToOne(() => SymbolEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "credit_base_symbol_id" })
  creditBaseSymbol: SymbolEntity;

  @Column({ name: "credit_base_symbol_id", type: "uuid", nullable: true })
  creditBaseSymbolId: string;

  @Column({ type: "decimal", precision: 10, scale: 4, nullable: true, name: "credit_max_leverage" })
  creditMaxLeverage: number;

  // Drawdown threshold as % loss vs frozen collateral value.
  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true, name: "credit_drawdown_percent" })
  creditDrawdownPercent: number;

  @Column({
    type: "enum",
    enum: CreditEnforceModeEnum,
    nullable: true,
    name: "credit_enforce_on_drawdown",
  })
  creditEnforceOnDrawdown: CreditEnforceModeEnum;

  @Column({
    type: "enum",
    enum: CreditEnforceModeEnum,
    nullable: true,
    name: "credit_enforce_on_expiry",
  })
  creditEnforceOnExpiry: CreditEnforceModeEnum;

  // When true the system force-closes credit-linked requests whose pend
  // deadline (pair x/y/z) passed; when false it only alerts.
  @Column({ type: "boolean", nullable: true, name: "credit_enforce_request_deadline" })
  creditEnforceRequestDeadline: boolean;

  @Column({ type: "int", nullable: true, name: "credit_max_parallel_requests" })
  creditMaxParallelRequests: number;

  // Max hops a user can do with credit (IRR→XAU = 1, XAU→AED = 2).
  @Column({ type: "int", nullable: true, name: "credit_max_execution_level" })
  creditMaxExecutionLevel: number;

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
