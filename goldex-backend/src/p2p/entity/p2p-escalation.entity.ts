import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { P2pMatchEntity } from "./p2p-match.entity";
import {
  P2pEscalationReasonEnum,
  P2pEscalationStatusEnum,
  P2pResolutionTypeEnum,
} from "../enum/p2p.enums";

@Entity("p2p_escalation")
@Index(["status", "priority"])
export class P2pEscalationEntity extends myBaseEntity {
  @Column({ name: "match_id", type: "uuid" })
  matchId: string;

  @ManyToOne(() => P2pMatchEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "match_id" })
  match: P2pMatchEntity;

  @Column({ name: "reason", type: "enum", enum: P2pEscalationReasonEnum })
  reason: P2pEscalationReasonEnum;

  /** Lower is more urgent. */
  @Column({ name: "priority", type: "smallint", default: 5 })
  priority: number;

  @Column({
    name: "status",
    type: "enum",
    enum: P2pEscalationStatusEnum,
    default: P2pEscalationStatusEnum.OPEN,
  })
  status: P2pEscalationStatusEnum;

  @Column({ name: "deadline_at", type: "timestamptz", nullable: true })
  deadlineAt?: Date;

  @Column({ name: "assigned_admin_id", type: "uuid", nullable: true })
  assignedAdminId?: string;

  @Column({ name: "resolution_type", type: "enum", enum: P2pResolutionTypeEnum, nullable: true })
  resolutionType?: P2pResolutionTypeEnum;

  @Column({ name: "resolution_note", type: "text", nullable: true })
  resolutionNote?: string;

  @Column({ name: "resolved_by_admin_id", type: "uuid", nullable: true })
  resolvedByAdminId?: string;

  @Column({ name: "resolved_at", type: "timestamptz", nullable: true })
  resolvedAt?: Date;

  // Two-person control: the maker records the decision, a second admin checks
  // it before a high-value settlement executes (spec §12.3).
  @Column({ name: "checker_admin_id", type: "uuid", nullable: true })
  checkerAdminId?: string;

  @Column({ name: "checked_at", type: "timestamptz", nullable: true })
  checkedAt?: Date;

  @Column({ name: "pending_resolution_json", type: "jsonb", nullable: true })
  pendingResolutionJson?: Record<string, any>;
}
