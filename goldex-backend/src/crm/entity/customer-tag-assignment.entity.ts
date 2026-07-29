import { Entity, Column, ManyToOne, JoinColumn, Unique } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";
import { CustomerTagEntity } from "./customer-tag.entity";

@Entity("customer_tag_assignments")
@Unique(["userId", "tagId"])
export class CustomerTagAssignmentEntity extends myBaseEntity {
  @Column({ name: "user_id" })
  userId: string;

  @Column({ name: "tag_id" })
  tagId: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @ManyToOne(() => CustomerTagEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tag_id" })
  tag: CustomerTagEntity;

  @ManyToOne(() => AdminEntity)
  @JoinColumn({ name: "assigned_by" })
  assignedBy: AdminEntity;

  @Column({ name: "assigned_by" })
  assignedById: string;

  @Column({ type: "timestamptz", name: "assigned_at", default: () => "CURRENT_TIMESTAMP" })
  assignedAt: Date;
}
