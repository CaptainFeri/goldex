import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from "typeorm";
import { UserEntity } from "../../user/entity/user.entity";
import { CustomerSegmentEntity } from "./customer-segment.entity";

@Entity("customer_segment_assignments")
export class CustomerSegmentAssignmentEntity {
  @PrimaryColumn({ name: "segment_id" })
  segmentId: string;

  @PrimaryColumn({ name: "user_id" })
  userId: string;

  @ManyToOne(() => CustomerSegmentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "segment_id" })
  segment: CustomerSegmentEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ type: "timestamptz", name: "assigned_at", default: () => "CURRENT_TIMESTAMP" })
  assignedAt: Date;
}
