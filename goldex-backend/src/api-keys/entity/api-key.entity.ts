import { Column, Entity, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";

export enum ApiKeyStatus {
  ACTIVE = "active",
  /** Authenticates, but capped by `monthlyQuota`; past it the guard answers 429. */
  LIMITED = "limited",
  REVOKED = "revoked",
}

@Entity("api_keys")
export class ApiKeyEntity extends myBaseEntity {
  @Column({ type: "varchar", length: 120 })
  name: string;

  /**
   * SHA-256 of the key, not bcrypt.
   *
   * The plan suggested bcrypt because it is already a dependency, but bcrypt is
   * built to be slow, and this hash is checked on *every API request* — it would
   * add ~100ms to each one. bcrypt's slowness exists to defeat dictionary
   * attacks on low-entropy human passwords; these keys are 256 bits from a CSPRNG,
   * where there is no dictionary to attack. A single indexed SHA-256 lookup is
   * both the faster and the standard choice for high-entropy tokens.
   */
  @Index({ unique: true })
  @Column({ name: "key_hash", type: "char", length: 64 })
  keyHash: string;

  /** Shown to operators, e.g. `gx_live_`. Never enough to reconstruct the key. */
  @Column({ name: "key_prefix", type: "varchar", length: 16 })
  keyPrefix: string;

  @Column({ name: "last_four", type: "char", length: 4 })
  lastFour: string;

  @Column({ type: "enum", enum: ApiKeyStatus, default: ApiKeyStatus.ACTIVE })
  status: ApiKeyStatus;

  /** Required when status is `limited`; requests past it are refused. */
  @Column({ name: "monthly_quota", type: "int", nullable: true })
  monthlyQuota: number | null;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy: string | null;

  @Column({ name: "last_used_at", type: "timestamptz", nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt: Date | null;
}
