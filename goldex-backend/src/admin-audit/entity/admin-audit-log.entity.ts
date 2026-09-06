import { Column, Entity, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";

/**
 * One admin mutation.
 *
 * Append-only in practice: nothing in the codebase updates or deletes a row
 * here, and the module exposes no write endpoint. The value of an audit log is
 * that it cannot be edited by the people it records.
 */
@Entity("admin_audit_log")
@Index(["adminId", "createAt"])
@Index(["entity", "entityId"])
export class AdminAuditLogEntity extends myBaseEntity {
  @Index()
  @Column({ name: "admin_id", type: "uuid", nullable: true })
  adminId: string | null;

  /** Denormalised so the log still reads correctly after a rename or deletion. */
  @Column({ name: "admin_label", type: "varchar", length: 120, nullable: true })
  adminLabel: string | null;

  /** The permission the route demanded, when it declared one. */
  @Column({ type: "varchar", length: 120, nullable: true })
  permission: string | null;

  /** `POST /admin/accounting/vouchers/:id/finalize` — method and route pattern. */
  @Column({ type: "varchar", length: 200 })
  action: string;

  /** The resource family, taken from the route: `accounting/vouchers`. */
  @Index()
  @Column({ type: "varchar", length: 120, nullable: true })
  entity: string | null;

  /** The id in the path, when the route names one. */
  @Column({ name: "entity_id", type: "varchar", length: 100, nullable: true })
  entityId: string | null;

  /**
   * State before the change.
   *
   * Only populated by handlers that explicitly record it — an interceptor
   * cannot know what a row looked like before without fetching it, and
   * guessing would put a wrong "before" in the record that decides disputes.
   */
  @Column({ type: "jsonb", nullable: true })
  before: Record<string, unknown> | null;

  /** The request body, redacted. */
  @Column({ type: "jsonb", nullable: true })
  after: Record<string, unknown> | null;

  @Column({ name: "otp_challenge_id", type: "varchar", length: 64, nullable: true })
  otpChallengeId: string | null;

  @Column({ name: "status_code", type: "int", nullable: true })
  statusCode: number | null;

  /** Present when the mutation failed, so refusals are auditable too. */
  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ip: string | null;

  @Column({ name: "user_agent", type: "varchar", length: 400, nullable: true })
  userAgent: string | null;

  @Column({ name: "duration_ms", type: "int", nullable: true })
  durationMs: number | null;
}
