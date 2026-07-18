import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";

@Entity("admin_schedule")
export class AdminScheduleEntity extends myBaseEntity {
  @ManyToOne(() => AdminEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "admin_id" })
  admin: AdminEntity;

  @Column({ name: "admin_id" })
  adminId: string;

  @Column({ name: "day_of_week", type: "int" })
  dayOfWeek: number;

  @Column({ name: "day_label", type: "varchar", length: 20 })
  dayLabel: string;

  @Column({ name: "start_time", type: "varchar", length: 5 })
  startTime: string;

  @Column({ name: "end_time", type: "varchar", length: 5 })
  endTime: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "varchar", length: 50, default: "Asia/Tehran" })
  timezone: string;
}
