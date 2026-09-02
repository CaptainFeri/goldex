import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { P2pAuditActorEnum } from "../enum/p2p.enums";

/**
 * Insert-only. No update or delete path is exposed and there is deliberately
 * no soft-delete column — financial records are closed, never removed
 * (spec §12.4). `finance_log` is not reused: its action type is credit-shaped
 * and it has no before/after snapshot.
 */
@Entity("p2p_audit_log")
@Index(["entityType", "entityId"])
export class P2pAuditLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "actor_type", type: "enum", enum: P2pAuditActorEnum })
  actorType: P2pAuditActorEnum;

  @Column({ name: "actor_id", type: "uuid", nullable: true })
  actorId?: string;

  @Column({ name: "action" })
  action: string;

  @Column({ name: "entity_type" })
  entityType: string;

  @Column({ name: "entity_id", type: "uuid" })
  entityId: string;

  @Column({ name: "before_json", type: "jsonb", nullable: true })
  beforeJson?: Record<string, any>;

  @Column({ name: "after_json", type: "jsonb", nullable: true })
  afterJson?: Record<string, any>;

  @Column({ name: "ip", nullable: true })
  ip?: string;

  @Column({ name: "user_agent", type: "text", nullable: true })
  userAgent?: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
